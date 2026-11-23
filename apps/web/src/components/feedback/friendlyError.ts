const includesAny = (value: string, patterns: readonly string[]) =>
  patterns.some(pattern => value.includes(pattern));

/** Converts technical/API/wallet failures into safe, actionable product copy. */
export function friendlyErrorMessage(error: string): string {
  const value = error.trim().toUpperCase();

  if (includesAny(value, ['REJECT', 'DENIED', 'DECLINED', 'CANCELLED', 'CANCELED', 'USER_REFUSED'])) {
    return 'The request was cancelled in your wallet. No changes were made. You can try again when ready.';
  }
  if (includesAny(value, ['INSUFFICIENT', 'NOT_ENOUGH', 'LOW_BALANCE'])) {
    return 'Your wallet does not have enough funds for this amount and the network fee. Reduce the amount or add funds, then try again.';
  }
  if (includesAny(value, ['WRONG_NETWORK', 'CHAIN_MISMATCH', 'UNSUPPORTED_CHAIN', 'SWITCH_NETWORK'])) {
    return 'Your wallet is connected to a different network. Switch to the network shown in Fomeora and try again.';
  }
  if (includesAny(value, ['WALLET_PROVIDER_NOT_FOUND', 'WALLET_UNAVAILABLE', 'NO_PROVIDER'])) {
    return 'Fomeora could not find a compatible wallet. Open the site in a wallet browser or enable your wallet extension.';
  }
  if (includesAny(value, ['SESSION', 'AUTHENTICATION_REQUIRED', 'UNAUTHORIZED', 'AUTH_EXPIRED', 'TOKEN_EXPIRED', '401'])) {
    return 'Your session has expired. Sign in again, then repeat the action.';
  }
  if (includesAny(value, ['X_AUTH', 'OAUTH'])) {
    return 'X could not complete the connection. Start the X connection again; if it continues, wait a moment and retry.';
  }
  if (includesAny(value, ['RATE_LIMIT', 'TOO_MANY_REQUESTS', '429'])) {
    return 'Too many requests were made in a short time. Wait a moment, then try again.';
  }
  if (value.includes('TOKEN_RESERVE_CAP_NOT_CONFIGURED')) {
    return 'This asset is not enabled for new liquidity pools yet. Choose another pair or wait for the governance cap to become active.';
  }
  if (includesAny(value, ['TIMEOUT', 'NETWORK_ERROR', 'FETCH_FAILED', 'FAILED TO FETCH', 'RPC', 'UNAVAILABLE', '502', '503', '504'])) {
    return 'Fomeora could not reach the network service. Check your connection and try again in a moment.';
  }
  if (includesAny(value, ['GAS_ESTIMATE', 'ESTIMATE GAS'])) {
    return 'The transaction could not be prepared. Check the amount, token balance, and selected range before trying again.';
  }
  if (includesAny(value, ['APPROVAL', 'ALLOWANCE'])) {
    return 'Token approval was not completed. Confirm the correct token and amount in your wallet, then try again.';
  }
  if (includesAny(value, ['QUOTE', 'PRICE_CHANGED', 'SLIPPAGE'])) {
    return 'The price or quote changed before the action completed. Refresh the quote and try again.';
  }
  if (includesAny(value, ['REVERT', 'CALL_EXCEPTION', 'CONTRACT'])) {
    return 'The contract did not accept this transaction. Check your balance, amount, and selected range, then try again.';
  }
  if (includesAny(value, ['ALREADY_LINKED', 'ALREADY_EXISTS', 'CONFLICT', '409'])) {
    return 'This item is already connected or the action was already completed. Refresh the page to see its latest status.';
  }
  if (includesAny(value, ['INVALID', 'VALIDATION', 'REQUIRED', 'BAD_REQUEST', '400'])) {
    return 'Some information is missing or invalid. Review the entered values and try again.';
  }

  return 'We could not complete this action. Please try again. If it continues, refresh the page and check your wallet connection.';
}
