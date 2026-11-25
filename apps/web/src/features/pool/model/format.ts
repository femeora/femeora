import { formatCompactUsd, formatSubscriptPrice } from '@fomeora/sdk';

import type { Span } from '@/types/callout';

import type { Pool } from './pool';

/** Chart unit toggle (brief 8.1 toolbar: Price | MCap). */
export type ValueUnit = 'mcap' | 'price';

export function toUnit(priceUsd: number, unit: ValueUnit, pool: Pool): number {
  return unit === 'mcap' ? priceUsd * pool.supply : priceUsd;
}

export function formatPrice(value: number): string {
  // Lightweight Charts may ask the formatter to render a temporary tick just
  // below zero while calculating autoscale for very small token prices. The
  // public SDK correctly rejects negative prices, but a display formatter must
  // never be allowed to crash the chart (or the whole pool page).
  if (!Number.isFinite(value)) return '$0';
  return value < 0 ? `-${formatSubscriptPrice(Math.abs(value))}` : formatSubscriptPrice(value);
}

export function formatUnit(value: number, unit: ValueUnit): string {
  return unit === 'mcap' ? formatCompactUsd(value) : formatPrice(value);
}

export function formatPct(pct: number, digits = 1): string {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(digits)}%`;
}

/** Range as a display span: `±20%` when symmetric, otherwise a from/to pair. */
export function rangeSpan(minPct: number, maxPct: number): Span {
  if (minPct === -maxPct) return `±${maxPct}%`;
  return [formatPct(minPct, 0), formatPct(maxPct, 0)];
}

/** Range as plain text for labels and screen readers: `-35% to -1%`. */
export function formatRange(minPct: number, maxPct: number): string {
  const span = rangeSpan(minPct, maxPct);
  return typeof span === 'string' ? span : `${span[0]} to ${span[1]}`;
}

export function formatTokenAmount(amount: number): string {
  return amount.toLocaleString('en-US', { maximumFractionDigits: amount < 1 ? 6 : 2 });
}

export function formatUsdMetric(value: number): string {
  if (value !== 0 && Math.abs(value) < 0.01) return value < 0 ? '>-$0.01' : '<$0.01';
  return formatCompactUsd(value);
}

export { formatCompactUsd };
