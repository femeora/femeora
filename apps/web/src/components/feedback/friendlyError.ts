const includesAny = (value: string, patterns: readonly string[]) =>
  patterns.some(pattern => value.includes(pattern));

/** Converts technical/API/wallet failures into safe, actionable product copy. */
export function friendlyErrorMessage(error: string): string {
  const value = error.trim().toUpperCase();

  if (value.includes('DEPOSIT_TOO_SMALL')) {
    return 'The deposit is too small for the selected range. Narrow the range or increase the token amount, then review again.';
  }
  if (value.includes('TOKEN_DECIMALS_UNAVAILABLE')) {
    return 'Femeora could not read this token\'s decimal configuration. Refresh the pool and review the position again.';
  }
  if (value.includes('SWAP_POOL_MIGRATION_REQUIRED')) {
    return 'Swaps for this pool are temporarily paused while its USDG/WETH decimal handling is upgraded. Your liquidity positions are unaffected.';
  }
  if (value.includes('POSITION_POOL_NOT_CANONICAL')) {
    return 'This position belongs to a legacy pool. You can still manage or close it, but new callouts can only be posted from the active pool.';
  }
  if (
    includesAny(value, ['REJECT', 'DENIED', 'DECLINED', 'CANCELLED', 'CANCELED', 'USER_REFUSED'])
  ) {
    return 'The request was cancelled in your wallet. No changes were made. You can try again when ready.';
  }
  if (includesAny(value, ['INSUFFICIENT', 'NOT_ENOUGH', 'LOW_BALANCE'])) {
    return 'Your wallet does not have enough funds for this amount and the network fee. Reduce the amount or add funds, then try again.';
  }
  if (
    includesAny(value, ['WRONG_NETWORK', 'CHAIN_MISMATCH', 'UNSUPPORTED_CHAIN', 'SWITCH_NETWORK'])
  ) {
    return 'Your wallet is connected to a different network. Switch to the network shown in Femeora and try again.';
  }
  if (includesAny(value, ['WALLET_PROVIDER_NOT_FOUND', 'WALLET_UNAVAILABLE', 'NO_PROVIDER'])) {
    return 'Femeora could not find a compatible wallet. Open the site in a wallet browser or enable your wallet extension.';
  }
  if (
    includesAny(value, [
      'SESSION',
      'AUTHENTICATION_REQUIRED',
      'UNAUTHORIZED',
      'AUTH_EXPIRED',
      'TOKEN_EXPIRED',
      '401',
    ])
  ) {
    return 'Your session has expired. Sign in again, then repeat the action.';
  }
  if (includesAny(value, ['X_AUTH', 'OAUTH'])) {
    return 'X could not complete the connection. Start the X connection again; if it continues, wait a moment and retry.';
  }
  if (includesAny(value, ['RATE_LIMIT', 'TOO_MANY_REQUESTS', '429'])) {
    return 'Too many requests were made in a short time. Wait a moment, then try again.';
  }
  if (value.includes('SERVICE_TEMPORARILY_BUSY')) {
    return 'Femeora is handling unusually high activity. Wait a moment, then try again.';
  }
  if (value.includes('TOKEN_RESERVE_CAP_NOT_CONFIGURED')) {
    return 'This asset is not enabled for new liquidity pools yet. Choose another pair or wait for the governance cap to become active.';
  }
  if (value.includes('LAUNCH_PROTOCOL_NOT_DEPLOYED')) {
    return 'Token launches are not active on this network yet. Existing pools and positions are unaffected.';
  }
  if (value.includes('LAUNCHPAD_X_IDENTITY_MISMATCH')) {
    return 'The launchpad X handle must match the X account connected to Femeora.';
  }
  if (value.includes('TOKEN_X_IDENTITY_MISMATCH')) {
    return 'The token X handle must match the X account linked to this wallet. Leave it empty for a wallet-only launch.';
  }
  if (value.includes('LAUNCHPAD_SLUG_UNAVAILABLE')) {
    return 'That launchpad URL is already in use. Choose a different feed slug and try again.';
  }
  if (value.includes('UNSUPPORTED_LAUNCH_QUOTE_TOKEN')) {
    return 'This quote token is not enabled for Femeora launches. Select the supported WETH or USDG asset for this network.';
  }
  if (value.includes('INVALID_LAUNCHPAD_ADMINS')) {
    return 'Launchpad admins must be unique wallet addresses, must not repeat the owner, and are limited to ten.';
  }
  if (value.includes('LAUNCHPAD_ADMIN_REQUIRED')) {
    return 'Only the launchpad owner or one of its configured admins can change this launchpad.';
  }
  if (value.includes('PROTECTED_IDENTITY_CONFLICT')) {
    return 'A protected token already uses this name or ticker. Connect its verified X account or choose a distinct identity.';
  }
  if (value.includes('TOTAL_SUPPLY_BELOW_CURVE_ALLOCATION')) {
    return 'Total supply must be at least as large as the token allocation reserved for the bonding curve.';
  }
  if (value.includes('DEVELOPER_ALLOCATION_EXCEEDS_CAP')) {
    return 'The creator allocation exceeds this launchpad’s protected developer cap. Reduce total supply to the recommended amount or lower.';
  }
  if (
    value.includes('TOKEN_METADATA_TOO_LARGE') ||
    value.includes('LAUNCHPAD_METADATA_TOO_LARGE')
  ) {
    return 'The branding links are too long to store safely on-chain. Use shorter image, website, or domain URLs.';
  }
  if (value.includes('IDENTITY_PROOF_UNAVAILABLE')) {
    return 'Protected Launch verification is temporarily unavailable. No transaction was submitted; try again shortly.';
  }
  if (value.includes('X_ACCOUNT_REQUIRED')) {
    return 'This Protected Launch requires a connected X account before the token can be created.';
  }
  if (value.includes('LAUNCH_ALREADY_GRADUATED') || value.includes('LAUNCH_NOT_GRADUATED')) {
    return 'The launch state changed on-chain. Refresh the page to continue from its latest stage.';
  }
  if (value.includes('GRADUATION_NOT_READY')) {
    return 'This curve has not reached its graduation threshold yet. Graduation will run automatically when the threshold-crossing buy confirms.';
  }
  if (
    includesAny(value, [
      'TIMEOUT',
      'NETWORK_ERROR',
      'FETCH_FAILED',
      'FAILED TO FETCH',
      'RPC',
      'UNAVAILABLE',
      '502',
      '503',
      '504',
    ])
  ) {
    return 'Femeora could not reach the network service. Check your connection and try again in a moment.';
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
