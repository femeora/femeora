/**
 * Precision formatting utilities and DLMM calculations
 */

export function formatCompactUsd(val: number): string {
  if (Math.abs(val) >= 1_000_000_000) {
    return `$${(val / 1_000_000_000).toFixed(2)}B`;
  }
  if (Math.abs(val) >= 1_000_000) {
    return `$${(val / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(val) >= 1_000) {
    return `$${(val / 1_000).toFixed(2)}K`;
  }
  return `$${val.toFixed(2)}`;
}

export function formatSubscriptPrice(val: number): string {
  if (val >= 0.01 || val === 0) {
    return `$${val.toFixed(4)}`;
  }
  const str = val.toFixed(10);
  const match = str.match(/^0\.(0+)(\d{4})/);
  if (!match) return `$${val.toFixed(4)}`;
  const zeroCount = match[1]?.length ?? 0;
  const digits = match[2] ?? '';
  return `$0.0{${zeroCount}}${digits}`;
}

export interface PositionCalculationInput {
  valueNowUsd: number;
  withdrawnUsd: number;
  depositedUsd: number;
  accruedFeesQuote: number;
}

export function computePositionPnL(input: PositionCalculationInput): {
  profitUsd: number;
  earnedUsd: number;
  roiPercentage: number;
} {
  const profitUsd = input.valueNowUsd + input.withdrawnUsd - input.depositedUsd;
  const earnedUsd = input.accruedFeesQuote;
  const roiPercentage = input.depositedUsd > 0 ? (profitUsd / input.depositedUsd) * 100 : 0;

  return {
    profitUsd,
    earnedUsd,
    roiPercentage,
  };
}
