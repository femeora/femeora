import { priceFromBinX18, shapeWeights, token1Value } from '@fomeora/sdk';

export const MAX_POSITION_BINS = 61;
export const MINIMUM_BIN_LIQUIDITY = 1_000n;

export type PositionShape = 'spot' | 'curve' | 'bid-ask';

export interface PositionBinState {
  binId: number;
  reserve0: bigint;
  reserve1: bigint;
  totalShares: bigint;
}

function weights(length: number, shape: PositionShape): bigint[] {
  if (!Number.isInteger(length) || length < 1 || length > MAX_POSITION_BINS) {
    throw new RangeError('INVALID_BIN_COUNT');
  }
  const activeBin = Math.floor((length - 1) / 2);
  return shapeWeights({ lowerBin: 0, upperBin: length - 1, activeBin, shape }).map(item => item.weight);
}

/** Allocates every raw unit deterministically; remainder goes from the first bin onward. */
export function distributeAmount(total: bigint, length: number, shape: PositionShape): bigint[] {
  if (total < 0n) throw new RangeError('INVALID_AMOUNT');
  const binWeights = weights(length, shape);
  const totalWeight = binWeights.reduce((sum, weight) => sum + weight, 0n);
  const minimum = total >= BigInt(length) ? 1n : 0n;
  const distributable = total - minimum * BigInt(length);
  const result = binWeights.map(weight => minimum + distributable * weight / totalWeight);
  let remainder = total - result.reduce((sum, amount) => sum + amount, 0n);
  for (let index = 0; remainder > 0n; index = (index + 1) % result.length) {
    result[index] = (result[index] ?? 0n) + 1n;
    remainder -= 1n;
  }
  return result;
}

function pctToOffset(pct: number, binStepBps: number, rounding: 'floor' | 'ceil'): number {
  if (!Number.isFinite(pct) || pct <= -100) throw new RangeError('INVALID_RANGE');
  if (!Number.isInteger(binStepBps) || binStepBps <= 0 || binStepBps > 1_000) {
    throw new RangeError('INVALID_BIN_STEP');
  }
  const offset = Math.log1p(pct / 100) / Math.log1p(binStepBps / 10_000);
  return rounding === 'floor' ? Math.floor(offset) : Math.ceil(offset);
}

export function rangeBins(activeBin: number, minPct: number, maxPct: number, binStepBps: number): number[] {
  if (!Number.isInteger(activeBin) || maxPct <= minPct) throw new RangeError('INVALID_RANGE');
  const lower = activeBin + pctToOffset(minPct, binStepBps, 'ceil');
  const upper = activeBin + pctToOffset(maxPct, binStepBps, 'floor');
  if (lower > upper || lower < -10_000 || upper > 10_000) throw new RangeError('INVALID_RANGE');
  const length = upper - lower + 1;
  if (length > MAX_POSITION_BINS) throw new RangeError('TOO_MANY_BINS');
  return Array.from({ length }, (_, index) => lower + index);
}

export function allocateRangeAmounts(input: {
  bins: number[];
  activeBin: number;
  amount0: bigint;
  amount1: bigint;
  shape: PositionShape;
}): { amounts0: bigint[]; amounts1: bigint[] } {
  const below = input.bins.filter(bin => bin < input.activeBin);
  const atOrAbove = input.bins.filter(bin => bin >= input.activeBin);
  if (below.length === 0 && input.amount1 !== 0n) throw new RangeError('TOKEN1_OUTSIDE_RANGE');
  if (atOrAbove.length === 0 && input.amount0 !== 0n) throw new RangeError('TOKEN0_OUTSIDE_RANGE');
  const allWeights = new Map(shapeWeights({
    lowerBin: input.bins[0]!, upperBin: input.bins.at(-1)!, activeBin: input.activeBin, shape: input.shape,
  }).map(item => [item.bin, item.weight]));
  const distribute = (total: bigint, bins: number[]) => {
    if (bins.length === 0) return [0n];
    const selected = bins.map(bin => allWeights.get(bin) ?? 1n);
    const totalWeight = selected.reduce((sum, weight) => sum + weight, 0n);
    const minimum = total >= BigInt(bins.length) ? 1n : 0n;
    const distributable = total - minimum * BigInt(bins.length);
    const amounts = selected.map(weight => minimum + distributable * weight / totalWeight);
    let remainder = total - amounts.reduce((sum, amount) => sum + amount, 0n);
    const order = bins.map((bin, index) => ({ index, distance: Math.abs(bin - input.activeBin) }))
      .sort((left, right) => right.distance - left.distance || left.index - right.index);
    for (let cursor = 0; remainder > 0n; cursor = (cursor + 1) % order.length) {
      const index = order[cursor]!.index;
      amounts[index] = (amounts[index] ?? 0n) + 1n;
      remainder -= 1n;
    }
    return amounts;
  };
  const belowAmounts = distribute(input.amount1, below);
  const aboveAmounts = distribute(input.amount0, atOrAbove);
  let belowIndex = 0;
  let aboveIndex = 0;
  return {
    amounts0: input.bins.map(bin => bin < input.activeBin ? 0n : (aboveAmounts[aboveIndex++] ?? 0n)),
    amounts1: input.bins.map(bin => bin < input.activeBin ? (belowAmounts[belowIndex++] ?? 0n) : 0n),
  };
}

export function minimumShares(input: {
  bin: PositionBinState;
  amount0: bigint;
  amount1: bigint;
  binStepBps: number;
  decimals0: number;
  decimals1: number;
  slippageBps: number;
}): bigint {
  const price = priceFromBinX18(input.bin.binId, input.binStepBps);
  const depositValue = token1Value(input.amount0, input.amount1, price, input.decimals0, input.decimals1);
  let shares: bigint;
  if (input.bin.totalShares === 0n) {
    if (depositValue <= MINIMUM_BIN_LIQUIDITY) throw new RangeError('DEPOSIT_TOO_SMALL');
    shares = depositValue - MINIMUM_BIN_LIQUIDITY;
  } else {
    const beforeValue = token1Value(
      input.bin.reserve0,
      input.bin.reserve1,
      price,
      input.decimals0,
      input.decimals1,
    );
    shares = depositValue * input.bin.totalShares / beforeValue;
  }
  if (shares === 0n) throw new RangeError('DEPOSIT_TOO_SMALL');
  return shares * BigInt(10_000 - input.slippageBps) / 10_000n;
}
