export interface RangeClockSwap {
  readonly timestamp: Date;
  readonly activeBinBefore: number;
  readonly activeBinAfter: number;
  readonly blockNumber: bigint;
  readonly transactionIndex: number;
  readonly logIndex: number;
}

export interface RangeClockPosition {
  readonly openedAt: Date;
  readonly closedAt: Date | null;
  readonly lowerBin: number;
  readonly upperBin: number;
}

export interface RangeClockResult {
  readonly inRangeSeconds: bigint;
  readonly openSeconds: bigint;
}

function unixSeconds(value: Date): bigint {
  const milliseconds = value.getTime();
  if (!Number.isFinite(milliseconds)) throw new RangeError('invalid clock timestamp');
  return BigInt(Math.floor(milliseconds / 1_000));
}

function compareSwaps(left: RangeClockSwap, right: RangeClockSwap): number {
  if (left.blockNumber !== right.blockNumber) return left.blockNumber < right.blockNumber ? -1 : 1;
  if (left.transactionIndex !== right.transactionIndex) {
    return left.transactionIndex - right.transactionIndex;
  }
  return left.logIndex - right.logIndex;
}

/** Replays canonical active-bin changes and measures inclusive in-range wall time. */
export function calculateRangeClock(
  position: RangeClockPosition,
  initialActiveBin: number,
  swaps: readonly RangeClockSwap[],
  measuredAt: Date,
): RangeClockResult {
  if (position.lowerBin > position.upperBin) throw new RangeError('invalid position range');
  const openedAt = unixSeconds(position.openedAt);
  const requestedEnd = unixSeconds(measuredAt);
  const closedAt = position.closedAt ? unixSeconds(position.closedAt) : requestedEnd;
  const end = closedAt < requestedEnd ? closedAt : requestedEnd;
  if (end <= openedAt) return { inRangeSeconds: 0n, openSeconds: 0n };

  let activeBin = initialActiveBin;
  let cursor = openedAt;
  let inRangeSeconds = 0n;
  for (const swap of [...swaps].sort(compareSwaps)) {
    const swapAt = unixSeconds(swap.timestamp);
    if (swapAt <= openedAt) {
      activeBin = swap.activeBinAfter;
      continue;
    }
    if (swapAt >= end) break;
    if (swapAt > cursor && activeBin >= position.lowerBin && activeBin <= position.upperBin) {
      inRangeSeconds += swapAt - cursor;
    }
    cursor = swapAt;
    activeBin = swap.activeBinAfter;
  }
  if (end > cursor && activeBin >= position.lowerBin && activeBin <= position.upperBin) {
    inRangeSeconds += end - cursor;
  }
  return { inRangeSeconds, openSeconds: end - openedAt };
}

export function calculateAlwaysInRangeClock(
  openedAt: Date,
  closedAt: Date | null,
  measuredAt: Date,
): RangeClockResult {
  const opened = unixSeconds(openedAt);
  const measured = unixSeconds(measuredAt);
  const closed = closedAt ? unixSeconds(closedAt) : measured;
  const end = closed < measured ? closed : measured;
  const duration = end > opened ? end - opened : 0n;
  return { inRangeSeconds: duration, openSeconds: duration };
}
