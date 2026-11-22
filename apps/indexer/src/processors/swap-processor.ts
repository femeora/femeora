/**
 * DLMM Swap Processor & Fee Attribution Engine
 * Dev Brief 10.3:
 * For each bin crossed in a swap:
 * lpFee_bin * (position_shares_bin / totalShares_bin) is credited to position earned_quote.
 */

export interface BinFeeAttribution {
  binId: number;
  totalFeeEarned: bigint;
  totalShares: bigint;
}

export function calculatePositionFeeShare(
  attribution: BinFeeAttribution,
  positionShares: bigint
): bigint {
  if (attribution.totalShares === 0n || positionShares === 0n) {
    return 0n;
  }
  return (attribution.totalFeeEarned * positionShares) / attribution.totalShares;
}
