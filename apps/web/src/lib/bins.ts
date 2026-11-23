import { shapeWeights } from '@fomeora/sdk';

import type { BinShape } from '@/types/callout';

/**
 * Relative liquidity weight (0..1) for bin `index` of `count`, following the
 * DLMM shapes in brief 8.3: Spot is flat, Curve peaks at the center,
 * Bid-Ask is heaviest at the edges.
 */
export function binWeight(shape: BinShape, index: number, count: number, activeIndex = Math.floor((count - 1) / 2)): number {
  const weights = shapeWeights({ lowerBin: 0, upperBin: count - 1, activeBin: activeIndex, shape });
  const max = weights.reduce((value, item) => item.weight > value ? item.weight : value, 1n);
  return Number(weights[index]?.weight ?? 0n) / Number(max);
}

export function binWeights(shape: BinShape, count: number, activeIndex = Math.floor((count - 1) / 2)): number[] {
  return Array.from({ length: count }, (_, index) => binWeight(shape, index, count, activeIndex));
}

export const SHAPE_LABEL: Record<BinShape, string> = {
  spot: 'Spot',
  curve: 'Curve',
  'bid-ask': 'Bid-Ask',
};
