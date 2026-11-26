import { LAUNCHPAD_REPUTATION_CONFIG } from './reputation-config.js';

export { LAUNCHPAD_REPUTATION_CONFIG } from './reputation-config.js';

export interface LaunchpadReputationInput {
  launches: number;
  graduationRate: number;
  survivalRate: number;
  medianTimeToGraduateSeconds: number | null;
  devExitRate: number;
  sniperShare: number;
  volumeQuote: number;
  revenueQuote: number;
  protectionScore: number;
}

export type LaunchpadReputationTier = 'Unrated' | 'Bronze' | 'Silver' | 'Gold' | 'Verified';

const clamp = (value: number, minimum = 0, maximum = 100) =>
  Math.min(Math.max(Number.isFinite(value) ? value : 0, minimum), maximum);

const logarithmicScore = (value: number, fullScoreAt: number) =>
  clamp((Math.log10(1 + Math.max(value, 0)) / Math.log10(1 + fullScoreAt)) * 100);

export function computeLaunchpadReputation(input: LaunchpadReputationInput): {
  score: number;
  tier: LaunchpadReputationTier;
} {
  const config = LAUNCHPAD_REPUTATION_CONFIG;
  const graduationSpeed =
    input.medianTimeToGraduateSeconds === null
      ? 0
      : clamp(
          ((config.slowGraduationSeconds - input.medianTimeToGraduateSeconds) /
            (config.slowGraduationSeconds - config.fastGraduationSeconds)) *
            100
        );
  const positive =
    clamp(input.graduationRate) * config.weights.graduationRate +
    clamp(input.survivalRate) * config.weights.survivalRate +
    graduationSpeed * config.weights.graduationSpeed +
    logarithmicScore(input.volumeQuote, config.volumeFullScoreQuote) * config.weights.volume +
    logarithmicScore(input.revenueQuote, config.revenueFullScoreQuote) * config.weights.revenue +
    clamp(input.protectionScore) * config.weights.protection;
  const penalties =
    clamp(input.devExitRate) * config.weights.devExitPenalty +
    clamp(input.sniperShare) * config.weights.sniperPenalty;
  const score = Number(clamp((positive - penalties) / 100).toFixed(2));
  if (input.launches < config.minimumRatedLaunches) return { score, tier: 'Unrated' };
  if (
    score >= config.verifiedMinimumScore &&
    input.launches >= config.verifiedMinimumLaunches &&
    input.protectionScore === 100
  )
    return { score, tier: 'Verified' };
  if (score >= 70) return { score, tier: 'Gold' };
  if (score >= 50) return { score, tier: 'Silver' };
  return { score, tier: 'Bronze' };
}
