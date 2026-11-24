import {
  convertTokenAmountAtPrice,
  priceFromBinX18,
  rawUnitsToDecimal,
} from '@fomeora/sdk';

import type { PositionEventProjection } from '../position-events.js';

export interface PositionAccountingPool {
  readonly tokenX: string;
  readonly tokenY: string;
  readonly tokenXDecimals: number | null;
  readonly tokenYDecimals: number | null;
  readonly quoteToken: string | null;
  readonly binStep: number;
}

export interface PositionCashFlow {
  readonly direction: 'deposit' | 'withdrawal';
  readonly amountQuote: string;
}

function stringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : null;
}

function numberArray(value: unknown): readonly number[] | null {
  return Array.isArray(value) && value.every(item => typeof item === 'number') ? value : null;
}

function quotePair(
  amountX: bigint,
  amountY: bigint,
  binId: number,
  pool: PositionAccountingPool,
): bigint | null {
  if (!pool.quoteToken || pool.tokenXDecimals === null || pool.tokenYDecimals === null) return null;
  const quote = pool.quoteToken.toLowerCase();
  const tokenX = pool.tokenX.toLowerCase();
  const tokenY = pool.tokenY.toLowerCase();
  const price = priceFromBinX18(binId, pool.binStep);
  if (quote === tokenY) {
    return amountY + convertTokenAmountAtPrice(
      amountX,
      price,
      true,
      pool.tokenXDecimals,
      pool.tokenYDecimals,
    );
  }
  if (quote === tokenX) {
    return amountX + convertTokenAmountAtPrice(
      amountY,
      price,
      false,
      pool.tokenYDecimals,
      pool.tokenXDecimals,
    );
  }
  return null;
}

/** Converts immutable on-chain position event amounts to the configured quote token. */
export function positionCashFlow(
  event: PositionEventProjection,
  pool: PositionAccountingPool,
): PositionCashFlow | null {
  return positionCashFlowFromPayload(event.kind, event.payload, event.state.activeBin, pool);
}

export function positionCashFlowFromPayload(
  kind: PositionEventProjection['kind'],
  sourcePayload: unknown,
  activeBin: number | null,
  pool: PositionAccountingPool,
): PositionCashFlow | null {
  if (kind !== 'created' && kind !== 'increased' && kind !== 'decreased') return null;
  const quoteDecimals = pool.quoteToken?.toLowerCase() === pool.tokenX.toLowerCase()
    ? pool.tokenXDecimals
    : pool.quoteToken?.toLowerCase() === pool.tokenY.toLowerCase()
      ? pool.tokenYDecimals
      : null;
  if (quoteDecimals === null) return null;

  if (!sourcePayload || typeof sourcePayload !== 'object' || Array.isArray(sourcePayload)) return null;
  const payload = sourcePayload as Record<string, unknown>;
  const bins = numberArray(payload.bins);
  const amountsX = stringArray(payload.amountsX);
  const amountsY = stringArray(payload.amountsY);
  let quoteRaw = 0n;
  if (bins && amountsX && amountsY && bins.length === amountsX.length && bins.length === amountsY.length) {
    for (let index = 0; index < bins.length; index += 1) {
      const bin = bins[index];
      const amountX = amountsX[index];
      const amountY = amountsY[index];
      if (bin === undefined || amountX === undefined || amountY === undefined) return null;
      const converted = quotePair(BigInt(amountX), BigInt(amountY), bin, pool);
      if (converted === null) return null;
      quoteRaw += converted;
    }
  } else if (typeof payload.amountX === 'string' && typeof payload.amountY === 'string') {
    if (activeBin === null) return null;
    const converted = quotePair(
      BigInt(payload.amountX),
      BigInt(payload.amountY),
      activeBin,
      pool,
    );
    if (converted === null) return null;
    quoteRaw = converted;
  } else {
    return null;
  }
  return {
    direction: kind === 'decreased' ? 'withdrawal' : 'deposit',
    amountQuote: rawUnitsToDecimal(quoteRaw, quoteDecimals, 18),
  };
}
