import { rangeBinBounds, rangeFromBinBounds, type RangeInput } from './range';

export interface ContractAmounts {
  amountX: string;
  amountY: string;
}

export interface PercentageRange {
  minPct: number;
  maxPct: number;
}

/** Convert user-facing base/quote amounts back to the pool contract's X/Y order. */
export function toContractAmounts(
  baseIsTokenX: boolean,
  baseAmount: string,
  quoteAmount: string,
): ContractAmounts {
  return baseIsTokenX
    ? { amountX: baseAmount, amountY: quoteAmount }
    : { amountX: quoteAmount, amountY: baseAmount };
}

/** Convert a user-facing quote/base price range to tokenY/tokenX bin space. */
export function toContractRange(
  baseIsTokenX: boolean,
  range: PercentageRange,
): PercentageRange {
  if (baseIsTokenX) return range;
  return {
    minPct: (1 / (1 + range.maxPct / 100) - 1) * 100,
    maxPct: (1 / (1 + range.minPct / 100) - 1) * 100,
  };
}

export interface ContractBinBounds {
  lowerBin: number;
  upperBin: number;
}

export function toContractBinBounds(
  baseIsTokenX: boolean,
  activeBin: number,
  visibleRange: RangeInput,
  binStepBps: number,
): ContractBinBounds {
  return rangeBinBounds(activeBin, toContractRange(baseIsTokenX, visibleRange), binStepBps);
}

export function fromContractBinBounds(
  baseIsTokenX: boolean,
  activeBin: number,
  bounds: ContractBinBounds,
  binStepBps: number,
): RangeInput {
  return toContractRange(baseIsTokenX, rangeFromBinBounds(activeBin, bounds, binStepBps));
}
