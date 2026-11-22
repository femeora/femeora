/**
 * Best Tab Ranking Algorithm
 * Score = (earned_usd_window / max(size_usd, 50))
 *         * in_range_ratio_window (0..1)
 *         * (1 + log10(1 + tailers))
 *         * penalty
 */

export interface RankingInput {
  earnedUsdWindow: number;
  sizeUsd: number;
  inRangeRatioWindow: number; // 0.0 to 1.0
  tailersCount: number;
  hasQuickExit: boolean; // Exited within 30 min -> penalty = 0
  hasOppositeSideLiquidity: boolean; // Caller holds >= 50% opposite -> penalty = 0.5
}

export function computeCalloutScore(input: RankingInput): number {
  if (input.hasQuickExit) {
    return 0; // Excluded from Best
  }

  const penalty = input.hasOppositeSideLiquidity ? 0.5 : 1.0;
  const normalizedSize = Math.max(input.sizeUsd, 50);
  const feeYield = input.earnedUsdWindow / normalizedSize;
  const inRangeFactor = Math.min(Math.max(input.inRangeRatioWindow, 0), 1);
  const socialProof = 1 + Math.log10(1 + Math.max(input.tailersCount, 0));

  return feeYield * inRangeFactor * socialProof * penalty;
}
