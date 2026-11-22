import type { BinShape } from '@/types/callout';

/**
 * Relative liquidity weight (0..1) for bin `index` of `count`, following the
 * DLMM shapes in brief 8.3: Spot is flat, Curve peaks at the center,
 * Bid-Ask is heaviest at the edges.
 */
export function binWeight(shape: BinShape, index: number, count: number): number {
  const center = (count - 1) / 2;
  const distance = center === 0 ? 0 : Math.abs(index - center) / center;

  switch (shape) {
    case 'spot':
      return 0.62;
    case 'curve':
      return 0.18 + 0.82 * Math.cos((distance * Math.PI) / 2) ** 2;
    case 'bid-ask':
      return 0.18 + 0.82 * distance ** 1.6;
  }
}

export function binWeights(shape: BinShape, count: number): number[] {
  return Array.from({ length: count }, (_, index) => binWeight(shape, index, count));
}

/** Small deterministic PRNG so illustrative charts render the same on server and client. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

export const SHAPE_LABEL: Record<BinShape, string> = {
  spot: 'Spot',
  curve: 'Curve',
  'bid-ask': 'Bid-Ask',
};
