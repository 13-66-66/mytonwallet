import type { GlobalState } from '../../global/types';
import type { LedgerWalletInfo } from '../../util/ledger/types';
import type { ApiTonWalletVersion } from '../chains/ton/types';
import type {
  ApiAccountAny,
  ApiAccountWithMnemonic,
  ApiActivityTimestamps,
  ApiChain,
  ApiImportAddressByChain,
  ApiLedgerAccount,
  ApiNetwork,
  ApiTonWallet,
  ApiViewAccount,
} from '../types';
import { ApiCommonError } from '../types';

import { DEFAULT_WALLET_VERSION, IS_BIP39_MNEMONIC_ENABLED, IS_CORE_WALLET } from '../../config';
import { buildAccountId, parseAccountId } from '../../util/account';
import isMnemonicPrivateKey from '../../util/isMnemonicPrivateKey';
import chains from '../chains';
import { toBase64Address } from '../chains/ton/util/tonCore';
import {
  fetchStoredAccounts,
  getAddressesFromAccount,
  getNewAccountId,
  removeAccountValue,
  removeNetworkAccountsValue,
  setAccountValue,
  updateStoredAccount,
} from '../common/accounts';
import {
  decryptMnemonic, encryptMnemonic, generateBip39Mnemonic, validateBip39Mnemonic,
} from '../common/mnemonic';
import { nftRepository, tokenRepository } from '../db';
import { getEnvironment } from '../environment';
import { handleServerError } from '../errors';
import { storage } from '../storages';
import { activateAccount, deactivateAllAccounts } from './accounts';
import { removeAccountDapps, removeAllDapps, removeNetworkDapps } from './dapps';

export { importNewWalletVersion } from '../chains/ton';

const { ton, tron } = chains;

export function generateMnemonic(isBip39 = IS_BIP39_MNEMONIC_ENABLED) {
  if (isBip39) return generateBip39Mnemonic();
  return ton.generateMnemonic();
}

export function createWallet(
  network: ApiNetwork,
  mnemonic: string[],
  password: string,
  version?: ApiTonWalletVersion,
) {
  if (!version) version = DEFAULT_WALLET_VERSION;

  return importMnemonic(network, mnemonic, password, version);
}

export function validateMnemonic(mnemonic: string[]) {
  return (validateBip39Mnemonic(mnemonic) && IS_BIP39_MNEMONIC_ENABLED) || chains.ton.validateMnemonic(mnemonic);
}

export async function importMnemonic(
  network: ApiNetwork,
  mnemonic: string[],
  password: string,
  version?: ApiTonWalletVersion,
) {
  const isPrivateKey = isMnemonicPrivateKey(mnemonic);
  let isBip39Mnemonic = validateBip39Mnemonic(mnemonic);
  const isTonMnemonic = await ton.validateMnemonic(mnemonic);

  if (!isPrivateKey && !isTonMnemonic && (!isBip39Mnemonic || !IS_BIP39_MNEMONIC_ENABLED)) {
    throw new Error('Invalid mnemonic');
  }

  const accountId: string = await getNewAccountId(network);
  const mnemonicEncrypted = await encryptMnemonic(mnemonic, password);

  // This is a defensive approach against potential corrupted encryption reported by some users
  const decryptedMnemonic = await decryptMnemonic(mnemonicEncrypted, password)
    .catch(() => undefined);

  if (!password || !decryptedMnemonic) {
    return { error: ApiCommonError.DebugError };
  }

  let account: ApiAccountAny;
  let tonWallet: ApiTonWallet & { lastTxId?: string } | undefined;

  try {
    if (isBip39Mnemonic && isTonMnemonic) {
      tonWallet = await ton.getWalletFromMnemonic(mnemonic, network, version);
      if (tonWallet.lastTxId) {
        isBip39Mnemonic = false;
      }
    }

    if (isBip39Mnemonic) {
      const tronWallet = tron.getWalletFromBip39Mnemonic(network, mnemonic);
      tonWallet = await ton.getWalletFromBip39Mnemonic(network, mnemonic);

      account = {
        type: 'bip39',
        mnemonicEncrypted,
        tron: tronWallet,
        ton: tonWallet,
      };
    } else {
      if (!tonWallet) {
        tonWallet = isPrivateKey
          ? await ton.getWalletFromPrivateKey(mnemonic[0], network, version)
          : await ton.getWalletFromMnemonic(mnemonic, network, version);
      }
      account = {
        type: 'ton',
        mnemonicEncrypted,
        ton: tonWallet,
      };
    }

    await setAccountValue(accountId, 'accounts', account);
    const secondNetworkAccount = IS_CORE_WALLET ? await createAccountWithSecondNetwork({
      accountId, network, mnemonic, mnemonicEncrypted, version,
    }) : undefined;
    void activateAccount(accountId);

    return {
      accountId,
      addressByChain: getAddressesFromAccount(account),
      secondNetworkAccount,
    };
  } catch (err) {
    return handleServerError(err);
  }
}

export async function createAccountWithSecondNetwork(options: {
  accountId: string;
  network: ApiNetwork;
  mnemonic: string[];
  mnemonicEncrypted: string;
  version?: ApiTonWalletVersion;
}): Promise<GlobalState['auth']['secondNetworkAccount']> {
  const {
    mnemonic, version, mnemonicEncrypted,
  } = options;
  const { network, accountId } = options;
  const tonWallet = await ton.getWalletFromMnemonic(mnemonic, network, version);

  const secondNetwork = network === 'testnet' ? 'mainnet' : 'testnet';
  const secondAccountId = buildAccountId({ ...parseAccountId(accountId), network: secondNetwork });
  tonWallet.address = toBase64Address(tonWallet.address, false, secondNetwork);
  const account = {
    type: 'ton',
    mnemonicEncrypted,
    ton: tonWallet,
  };
  await setAccountValue(secondAccountId, 'accounts', account);

  return {
    accountId: secondAccountId,
    addressByChain: { ton: tonWallet.address },
    network: secondNetwork,
  };
}

export async function importLedgerWallet(network: ApiNetwork, walletInfo: LedgerWalletInfo) {
  const accountId: string = await getNewAccountId(network);
  const {
    publicKey, address, index, driver, deviceId, deviceName, version,
  } = walletInfo;

  await storeHardwareAccount(accountId, {
    type: 'ledger',
    ton: {
      type: 'ton',
      address,
      publicKey,
      version,
      index,
    },
    driver,
    deviceId,
    deviceName,
  });

  return { accountId, address, walletInfo };
}

function storeHardwareAccount(accountId: string, account?: ApiLedgerAccount) {
  return setAccountValue(accountId, 'accounts', account);
}

export async function removeNetworkAccounts(network: ApiNetwork) {
  deactivateAllAccounts();

  await Promise.all([
    removeNetworkAccountsValue(network, 'accounts'),
    getEnvironment().isDappSupported && removeNetworkDapps(network),
  ]);

  for (const chain of Object.keys(chains)) {
    chains[chain as ApiChain].clearAccountsCacheByNetwork(network);
  }
}

export async function resetAccounts() {
  deactivateAllAccounts();

  await Promise.all([
    storage.removeItem('accounts'),
    storage.removeItem('currentAccountId'),
    getEnvironment().isDappSupported && removeAllDapps(),
    nftRepository.clear(),
    tokenRepository.clear(),
  ]);

  for (const chain of Object.keys(chains)) {
    chains[chain as ApiChain].clearAccountsCache();
  }
}

export async function removeAccount(
  accountId: string,
  nextAccountId: string,
  newestActivityTimestamps?: ApiActivityTimestamps,
) {
  await Promise.all([
    removeAccountValue(accountId, 'accounts'),
    getEnvironment().isDappSupported && removeAccountDapps(accountId),
    nftRepository.deleteWhere({ accountId }),
  ]);

  for (const chain of Object.keys(chains)) {
    chains[chain as ApiChain].clearAccountCache(accountId);
  }

  await activateAccount(nextAccountId, newestActivityTimestamps);
}

export async function changePassword(oldPassword: string, password: string) {
  for (const [accountId, account] of Object.entries(await fetchStoredAccounts())) {
    if (!('mnemonicEncrypted' in account)) continue;

    const mnemonic = await decryptMnemonic(account.mnemonicEncrypted, oldPassword);
    const encryptedMnemonic = await encryptMnemonic(mnemonic, password);

    await updateStoredAccount<ApiAccountWithMnemonic>(accountId, {
      mnemonicEncrypted: encryptedMnemonic,
    });
  }
}

export async function importViewAccount(network: ApiNetwork, addressByChain: ApiImportAddressByChain) {
  try {
    const account: ApiViewAccount = {
      type: 'view',
    };
    let title: string | undefined;

    if (addressByChain.ton) {
      const wallet = await ton.getWalletFromAddress(network, addressByChain.ton);
      if ('error' in wallet) return { ...wallet, chain: 'ton' };
      account.ton = wallet.wallet;
      title = wallet.title;
    }

    if (addressByChain.tron) {
      account.tron = {
        type: 'tron',
        address: addressByChain.tron,
        index: 0,
      };
    }

    const accountId = await getNewAccountId(network);
    await setAccountValue(accountId, 'accounts', account);
    void activateAccount(accountId);

    return {
      accountId,
      title,
      resolvedAddresses: getAddressesFromAccount(account),
    };
  } catch (err) {
    return handleServerError(err);
  }
}
