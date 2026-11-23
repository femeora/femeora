import { calculatePositionFeeShare } from './swap-processor.js';

export interface OrderedChainEvent {
  readonly blockNumber: bigint;
  readonly transactionIndex: number;
  readonly logIndex: number;
}

export interface InitialPositionShare {
  readonly poolId: string;
  readonly positionId: bigint;
  readonly binId: number;
  readonly shares: bigint;
}

export interface PositionShareChange extends OrderedChainEvent {
  readonly kind: 'shares';
  readonly poolId: string;
  readonly positionId: bigint;
  readonly bins: readonly number[];
  readonly shares: readonly bigint[];
}

export interface FeeAccrualEvent extends OrderedChainEvent {
  readonly kind: 'fee';
  readonly accrualId: string;
  readonly poolId: string;
  readonly binId: number;
  readonly lpFee: bigint;
  readonly totalShares: bigint;
  readonly timestamp: Date;
  readonly tokenIn: string;
}

export interface ProjectedFeeCredit {
  readonly accrualId: string;
  readonly poolId: string;
  readonly binId: number;
  readonly positionId: bigint;
  readonly timestamp: Date;
  readonly tokenIn: string;
  readonly amountRaw: bigint;
}

function order(left: OrderedChainEvent, right: OrderedChainEvent): number {
  if (left.blockNumber !== right.blockNumber) return left.blockNumber < right.blockNumber ? -1 : 1;
  if (left.transactionIndex !== right.transactionIndex) return left.transactionIndex - right.transactionIndex;
  return left.logIndex - right.logIndex;
}

function binKey(poolId: string, binId: number) {
  return `${poolId}:${binId}`;
}

type SharesByBin = Map<string, Map<bigint, bigint>>;

function applyShareChange(sharesByBin: SharesByBin, event: PositionShareChange): void {
  if (event.bins.length !== event.shares.length) throw new Error('INVALID_POSITION_SHARE_CHANGE');
  for (let index = 0; index < event.bins.length; index += 1) {
    const binId = event.bins[index];
    const shares = event.shares[index];
    if (binId === undefined || shares === undefined || shares < 0n) {
      throw new Error('INVALID_POSITION_SHARE_CHANGE');
    }
    const key = binKey(event.poolId, binId);
    const positions = sharesByBin.get(key) ?? new Map<bigint, bigint>();
    if (shares === 0n) positions.delete(event.positionId);
    else positions.set(event.positionId, shares);
    sharesByBin.set(key, positions);
  }
}

function creditsForFee(sharesByBin: SharesByBin, event: FeeAccrualEvent): ProjectedFeeCredit[] {
  if (event.lpFee < 0n || event.totalShares <= 0n) throw new Error('INVALID_BIN_FEE_ACCRUAL');
  const positions = sharesByBin.get(binKey(event.poolId, event.binId));
  if (!positions) return [];
  const credits: ProjectedFeeCredit[] = [];
  for (const [positionId, positionShares] of positions) {
    const amountRaw = calculatePositionFeeShare(
      { binId: event.binId, totalFeeEarned: event.lpFee, totalShares: event.totalShares },
      positionShares,
    );
    if (amountRaw > 0n) {
      credits.push({
        accrualId: event.accrualId,
        poolId: event.poolId,
        binId: event.binId,
        positionId,
        timestamp: event.timestamp,
        tokenIn: event.tokenIn,
        amountRaw,
      });
    }
  }
  return credits;
}

export function projectPositionFeeCredits(
  initial: readonly InitialPositionShare[],
  changes: readonly PositionShareChange[],
  fees: readonly FeeAccrualEvent[],
): readonly ProjectedFeeCredit[] {
  const sharesByBin = new Map<string, Map<bigint, bigint>>();
  for (const row of initial) {
    const positions = sharesByBin.get(binKey(row.poolId, row.binId)) ?? new Map<bigint, bigint>();
    if (row.shares > 0n) positions.set(row.positionId, row.shares);
    sharesByBin.set(binKey(row.poolId, row.binId), positions);
  }

  const credits: ProjectedFeeCredit[] = [];
  const events: readonly (PositionShareChange | FeeAccrualEvent)[] = [...changes, ...fees].sort(order);
  for (const event of events) {
    if (event.kind === 'shares') {
      applyShareChange(sharesByBin, event);
      continue;
    }
    credits.push(...creditsForFee(sharesByBin, event));
  }
  return credits;
}
