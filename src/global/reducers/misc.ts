import type { ApiToken } from '../../api/types';
import type { Account, AccountState, GlobalState } from '../types';

import { TON_TOKEN_SLUG } from '../../config';
import isPartialDeepEqual from '../../util/isPartialDeepEqual';
import {
  selectAccount,
  selectAccountState,
  selectCurrentNetwork,
  selectNetworkAccounts,
} from '../selectors';

export function updateAuth(global: GlobalState, authUpdate: Partial<GlobalState['auth']>) {
  return {
    ...global,
    auth: {
      ...global.auth,
      ...authUpdate,
    },
  } as GlobalState;
}

export function updateAccounts(
  global: GlobalState,
  state: Partial<GlobalState['accounts']>,
) {
  return {
    ...global,
    accounts: {
      ...(global.accounts || { byId: {} }),
      ...state,
    },
  };
}

export function createAccount(global: GlobalState, accountId: string, address: string, partial?: Partial<Account>) {
  if (!partial?.title) {
    const network = selectCurrentNetwork(global);
    const accounts = selectNetworkAccounts(global) || {};
    const titlePrefix = network === 'mainnet' ? 'Wallet' : 'Testnet Wallet';
    partial = { ...partial, title: `${titlePrefix} ${Object.keys(accounts).length + 1}` };
  }

  return updateAccount(global, accountId, { ...partial, address });
}

export function updateAccount(
  global: GlobalState,
  accountId: string,
  partial: Partial<Account>,
) {
  return {
    ...global,
    accounts: {
      ...global.accounts,
      byId: {
        ...global.accounts?.byId,
        [accountId]: {
          ...selectAccount(global, accountId),
          ...partial,
        } as Account,
      },
    },
  };
}

export function renameAccount(global: GlobalState, accountId: string, title: string) {
  return updateAccount(global, accountId, { title });
}

export function updateBalance(
  global: GlobalState, accountId: string, slug: string, balance: string,
): GlobalState {
  const { balances } = selectAccountState(global, accountId) || {};
  if (balances?.bySlug[slug] === balance) {
    return global;
  }

  return updateAccountState(global, accountId, {
    balances: {
      ...balances,
      bySlug: {
        ...balances?.bySlug,
        [slug]: balance,
      },
    },
  });
}

export function updateSendingLoading(global: GlobalState, isLoading: boolean): GlobalState {
  return {
    ...global,
    currentTransfer: {
      ...global.currentTransfer,
      isLoading,
    },
  };
}

export function updateTokens(
  global: GlobalState,
  partial: Record<string, ApiToken>,
  withDeepCompare = false,
): GlobalState {
  const currentTokens = global.tokenInfo?.bySlug;

  if (currentTokens?.[TON_TOKEN_SLUG] && !partial[TON_TOKEN_SLUG].quote.price) {
    return global;
  }

  if (withDeepCompare && currentTokens && isPartialDeepEqual(currentTokens, partial)) {
    return global;
  }

  return {
    ...global,
    tokenInfo: {
      ...global.tokenInfo,
      bySlug: {
        ...currentTokens,
        ...partial,
      },
    },
  };
}

export function updateCurrentAccountState(global: GlobalState, partial: Partial<AccountState>): GlobalState {
  return updateAccountState(global, global.currentAccountId!, partial);
}

export function updateAccountState(
  global: GlobalState, accountId: string, partial: Partial<AccountState>, withDeepCompare = false,
): GlobalState {
  const accountState = selectAccountState(global, accountId);

  if (withDeepCompare && accountState && isPartialDeepEqual(accountState, partial)) {
    return global;
  }

  return {
    ...global,
    byAccountId: {
      ...global.byAccountId,
      [accountId]: {
        ...accountState,
        ...partial,
      },
    },
  };
}

export function updateHardware(global: GlobalState, hardwareUpdate: Partial<GlobalState['hardware']>) {
  return {
    ...global,
    hardware: {
      ...global.hardware,
      ...hardwareUpdate,
    },
  } as GlobalState;
}

export function updateSettings(global: GlobalState, settingsUpdate: Partial<GlobalState['settings']>) {
  return {
    ...global,
    settings: {
      ...global.settings,
      ...settingsUpdate,
    },
  } as GlobalState;
}
