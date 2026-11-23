/** Exact shared calculations. On-chain integer functions use bigint and floor division. */

export const PRICE_SCALE = 10n ** 18n;
export const MIN_BIN_ID = -10_000;
export const MAX_BIN_ID = 10_000;
export const MAX_BIN_STEP_BPS = 1_000;
export type RangeSide = 'below' | 'above' | 'around';
export type LiquidityShape = 'spot' | 'curve' | 'bid-ask';

const SHAPE_WEIGHT_SCALE = 1_000_000_000;

/** Deterministic active-price-relative weights shared by previews and API allocation. */
export function shapeWeights(input: {
  lowerBin: number;
  upperBin: number;
  activeBin: number;
  shape: LiquidityShape;
}): readonly { bin: number; weight: bigint }[] {
  const { lowerBin, upperBin, activeBin, shape } = input;
  if (!Number.isInteger(lowerBin) || !Number.isInteger(upperBin) || lowerBin > upperBin) {
    throw new RangeError('invalid bin range');
  }
  if (lowerBin < MIN_BIN_ID || upperBin > MAX_BIN_ID) throw new RangeError('bin range out of bounds');
  const farthest = Math.max(1, Math.abs(activeBin - lowerBin), Math.abs(upperBin - activeBin));
  return Array.from({ length: upperBin - lowerBin + 1 }, (_, index) => {
    const bin = lowerBin + index;
    const distance = Math.min(1, Math.abs(bin - activeBin) / farthest);
    const numeric = shape === 'spot'
      ? 1
      : shape === 'curve'
        ? Math.exp(-(distance ** 2) / (2 * 0.35 ** 2))
        : 0.1 + distance ** 1.5;
    return { bin, weight: BigInt(Math.max(1, Math.round(numeric * SHAPE_WEIGHT_SCALE))) };
  });
}

export function classifyRangeSide(lowerBin: number, upperBin: number, activeBin: number): RangeSide {
  if (lowerBin > upperBin) throw new RangeError('lowerBin must not exceed upperBin');
  if (upperBin < activeBin) return 'below';
  if (lowerBin > activeBin) return 'above';
  return 'around';
}

function assertNonNegative(value: bigint, name: string): void {
  if (value < 0n) throw new RangeError(`${name} must be non-negative`);
}

export function mulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  assertNonNegative(a, 'a');
  assertNonNegative(b, 'b');
  if (denominator <= 0n) throw new RangeError('denominator must be positive');
  return (a * b) / denominator;
}

/** Mirrors Solidity BinPriceMath.priceFromBin, including every floor operation. */
export function priceFromBinX18(binId: number, binStepBps: number): bigint {
  if (!Number.isInteger(binId) || binId < MIN_BIN_ID || binId > MAX_BIN_ID) {
    throw new RangeError('binId out of range');
  }
  if (!Number.isInteger(binStepBps) || binStepBps <= 0 || binStepBps > MAX_BIN_STEP_BPS) {
    throw new RangeError('binStepBps out of range');
  }

  let baseX18 = PRICE_SCALE + BigInt(binStepBps) * 10n ** 14n;
  let exponent = Math.abs(binId);
  let result = PRICE_SCALE;
  while (exponent !== 0) {
    if ((exponent & 1) !== 0) result = mulDiv(result, baseX18, PRICE_SCALE);
    exponent = Math.floor(exponent / 2);
    if (exponent !== 0) baseX18 = mulDiv(baseX18, baseX18, PRICE_SCALE);
  }
  return binId >= 0 ? result : mulDiv(PRICE_SCALE, PRICE_SCALE, result);
}

/** Finds the closest valid bin for an X18 price using the exact on-chain price function. */
export function binForPriceX18(priceX18: bigint, binStepBps: number): number {
  if (priceX18 <= 0n) throw new RangeError('priceX18 must be positive');
  let low = MIN_BIN_ID;
  let high = MAX_BIN_ID;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (priceFromBinX18(middle, binStepBps) < priceX18) low = middle + 1;
    else high = middle;
  }
  if (low === MIN_BIN_ID) return low;
  const upper = priceFromBinX18(low, binStepBps);
  const lower = priceFromBinX18(low - 1, binStepBps);
  return priceX18 - lower <= upper - priceX18 ? low - 1 : low;
}

/** Mirrors Solidity BinPriceMath.quoteAtPrice. */
export function quoteAtPrice(amountIn: bigint, priceX18: bigint, token0ToToken1: boolean): bigint {
  assertNonNegative(amountIn, 'amountIn');
  if (priceX18 <= 0n) throw new RangeError('priceX18 must be positive');
  return token0ToToken1
    ? mulDiv(amountIn, priceX18, PRICE_SCALE)
    : mulDiv(amountIn, PRICE_SCALE, priceX18);
}

/** Converts one raw token amount into the other token's raw units, flooring like Solidity. */
export function convertTokenAmountAtPrice(
  amount: bigint,
  priceX18: bigint,
  token0ToToken1: boolean,
  decimals0: number,
  decimals1: number,
): bigint {
  assertNonNegative(amount, 'amount');
  if (priceX18 <= 0n) throw new RangeError('priceX18 must be positive');
  if (
    !Number.isInteger(decimals0) ||
    !Number.isInteger(decimals1) ||
    decimals0 < 0 ||
    decimals1 < 0 ||
    decimals0 > 36 ||
    decimals1 > 36
  ) {
    throw new RangeError('token decimals out of range');
  }
  let converted = token0ToToken1
    ? mulDiv(amount, priceX18, PRICE_SCALE)
    : mulDiv(amount, PRICE_SCALE, priceX18);
  const targetDecimals = token0ToToken1 ? decimals1 : decimals0;
  const sourceDecimals = token0ToToken1 ? decimals0 : decimals1;
  if (targetDecimals > sourceDecimals) converted *= 10n ** BigInt(targetDecimals - sourceDecimals);
  else if (sourceDecimals > targetDecimals) converted /= 10n ** BigInt(sourceDecimals - targetDecimals);
  return converted;
}

/** Mirrors Solidity DlmmV2LiquidityMath.token1Value in raw token1 units. */
export function token1Value(
  amount0: bigint,
  amount1: bigint,
  priceX18: bigint,
  decimals0: number,
  decimals1: number,
): bigint {
  assertNonNegative(amount0, 'amount0');
  assertNonNegative(amount1, 'amount1');
  if (priceX18 <= 0n) throw new RangeError('priceX18 must be positive');
  if (
    !Number.isInteger(decimals0) ||
    !Number.isInteger(decimals1) ||
    decimals0 < 0 ||
    decimals1 < 0 ||
    decimals0 > 36 ||
    decimals1 > 36
  ) {
    throw new RangeError('token decimals out of range');
  }
  const converted0 = convertTokenAmountAtPrice(amount0, priceX18, true, decimals0, decimals1);
  const value = amount1 + converted0;
  if (value === 0n) throw new RangeError('liquidity value must be non-zero');
  return value;
}

/** Converts token1 plus token0 into raw token0 units at a DLMM bin price. */
export function token0Value(
  amount0: bigint,
  amount1: bigint,
  priceX18: bigint,
  decimals0: number,
  decimals1: number,
): bigint {
  assertNonNegative(amount0, 'amount0');
  assertNonNegative(amount1, 'amount1');
  if (priceX18 <= 0n) throw new RangeError('priceX18 must be positive');
  if (
    !Number.isInteger(decimals0) ||
    !Number.isInteger(decimals1) ||
    decimals0 < 0 ||
    decimals1 < 0 ||
    decimals0 > 36 ||
    decimals1 > 36
  ) {
    throw new RangeError('token decimals out of range');
  }
  const converted1 = convertTokenAmountAtPrice(amount1, priceX18, false, decimals0, decimals1);
  const value = amount0 + converted1;
  if (value === 0n) throw new RangeError('liquidity value must be non-zero');
  return value;
}

/** Exact non-scientific decimal string, floored to at most `scale` fractional digits. */
export function rawUnitsToDecimal(raw: bigint, decimals: number, scale = 18): string {
  assertNonNegative(raw, 'raw');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new RangeError('token decimals out of range');
  }
  if (!Number.isInteger(scale) || scale < 0 || scale > 36) throw new RangeError('scale out of range');
  const adjusted = decimals > scale ? raw / 10n ** BigInt(decimals - scale) : raw;
  const adjustedDecimals = Math.min(decimals, scale);
  if (adjustedDecimals === 0) return adjusted.toString();
  const base = 10n ** BigInt(adjustedDecimals);
  const whole = adjusted / base;
  const fraction = (adjusted % base).toString().padStart(adjustedDecimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function amountsForShares(
  shares: bigint,
  reserve0: bigint,
  reserve1: bigint,
  totalShares: bigint,
): { amount0: bigint; amount1: bigint } {
  assertNonNegative(shares, 'shares');
  assertNonNegative(reserve0, 'reserve0');
  assertNonNegative(reserve1, 'reserve1');
  if (totalShares <= 0n) return { amount0: 0n, amount1: 0n };
  return {
    amount0: mulDiv(shares, reserve0, totalShares),
    amount1: mulDiv(shares, reserve1, totalShares),
  };
}

export interface PositionQuotePerformanceInput {
  valueQuote: bigint;
  withdrawnQuote: bigint;
  depositedQuote: bigint;
  earnedQuote: bigint;
}

export function computePositionQuotePerformance(input: PositionQuotePerformanceInput): {
  profitQuote: bigint;
  earnedQuote: bigint;
  roiBps: bigint;
} {
  const { valueQuote, withdrawnQuote, depositedQuote, earnedQuote } = input;
  for (const [name, value] of Object.entries(input)) assertNonNegative(value, name);
  const profitQuote = valueQuote + withdrawnQuote - depositedQuote;
  const roiBps = depositedQuote === 0n ? 0n : (profitQuote * 10_000n) / depositedQuote;
  return { profitQuote, earnedQuote, roiBps };
}

export function formatCompactUsd(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError('value must be finite');
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (absolute >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (absolute >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

function toSubscript(value: number): string {
  return String(value)
    .split('')
    .map(digit => SUBSCRIPT_DIGITS[Number(digit)])
    .join('');
}

export function formatSubscriptPrice(value: number): string {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('price must be finite and non-negative');
  if (value === 0 || value >= 0.01) return `$${value.toFixed(4)}`;
  const [mantissa = '0', exponentText = '0'] = value.toExponential(3).split('e');
  const exponent = Number(exponentText);
  const zeroCount = Math.max(0, Math.abs(exponent) - 1);
  const digits = mantissa.replace('.', '').slice(0, 4);
  return `$0.0${toSubscript(zeroCount)}${digits}`;
}

export interface PositionCalculationInput {
  valueNowUsd: number;
  withdrawnUsd: number;
  depositedUsd: number;
  accruedFeesQuote: number;
}

/** UI convenience wrapper; accounting/indexing code should use the bigint variant above. */
export function computePositionPnL(input: PositionCalculationInput): {
  profitUsd: number;
  earnedUsd: number;
  roiPercentage: number;
} {
  const profitUsd = input.valueNowUsd + input.withdrawnUsd - input.depositedUsd;
  return {
    profitUsd,
    earnedUsd: input.accruedFeesQuote,
    roiPercentage: input.depositedUsd > 0 ? (profitUsd / input.depositedUsd) * 100 : 0,
  };
}
