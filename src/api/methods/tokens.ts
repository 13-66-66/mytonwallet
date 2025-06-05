import type { ApiNetwork } from '../types';

import { parseAccountId } from '../../util/account';
import chains from '../chains';
import { fetchStoredAccount } from '../common/accounts';
import { getTokenByAddress } from '../common/tokens';

const { ton } = chains;

export { getTokenBySlug, buildTokenSlug } from '../common/tokens';

export function fetchToken(accountId: string, address: string) {
  const { network } = parseAccountId(accountId);
  return ton.fetchToken(network, address);
}

export function resolveTokenWalletAddress(network: ApiNetwork, address: string, tokenAddress: string) {
  const chain = chains.ton;

  return chain.resolveTokenWalletAddress(network, address, tokenAddress);
}

export function resolveTokenAddress(network: ApiNetwork, tokenWalletAddress: string) {
  const chain = chains.ton;

  return chain.resolveTokenAddress(network, tokenWalletAddress);
}

export async function fetchTokenBalances(accountId: string) {
  const account = await fetchStoredAccount(accountId);
  if (!('ton' in account)) return [];
  const chain = chains.ton;

  return chain.getAccountTokenBalances(accountId);
}

export function fetchTokenBalancesByAddress(address: string, network: ApiNetwork) {
  const chain = chains.ton;

  return chain.getTokenBalances(network, address);
}

export function getAmountForTokenTransfer(tokenAddress: string, willClaimMintless: boolean) {
  const chain = chains.ton;
  const token = getTokenByAddress(tokenAddress);

  return chain.getToncoinAmountForTransfer(token, willClaimMintless);
}
