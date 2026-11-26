/**
 * Public, deterministic launchpad-reputation parameters.
 *
 * Keeping every threshold and weight here makes a score reproducible from
 * indexed events without changing the calculation implementation.
 */
export const LAUNCHPAD_REPUTATION_CONFIG = {
  minimumRatedLaunches: 5,
  verifiedMinimumLaunches: 20,
  verifiedMinimumScore: 80,
  fastGraduationSeconds: 24 * 60 * 60,
  slowGraduationSeconds: 7 * 24 * 60 * 60,
  volumeFullScoreQuote: 50_000,
  revenueFullScoreQuote: 1_000,
  survivalLiquidityFloorQuote: 1,
  weights: {
    graduationRate: 20,
    survivalRate: 20,
    graduationSpeed: 10,
    volume: 10,
    revenue: 10,
    protection: 30,
    devExitPenalty: 5,
    sniperPenalty: 5,
  },
} as const;
