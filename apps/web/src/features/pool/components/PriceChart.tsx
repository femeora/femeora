'use client';

import {
  LineStyle,
  type AutoscaleInfo,
  type IPriceLine,
  type SeriesMarker,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useMemo, useState } from 'react';

import { CandlestickChart } from '@/components/ui/icons';
import { TokenPair } from '@/components/ui/TokenPair';
import { calloutStatus, rangeLabel, sideLabel, type Callout } from '@/features/callouts/model/callout';
import { cn } from '@/lib/cn';
import { tokenColor } from '@/lib/theme';

import { useChartProjection } from '../hooks/useChartProjection';
import { useLightweightChart } from '../hooks/useLightweightChart';
import { formatUnit, toUnit, type ValueUnit } from '../model/format';
import type { Candle, LiquidityBin, Pool } from '../model/pool';
import { applyPct, type RangeInput } from '../model/range';

import { CalloutPopover } from './CalloutPopover';
import { ChartOverlay } from './ChartOverlay';

interface PriceChartProps {
  pool: Pool;
  candles: readonly Candle[];
  /** Candle duration, used to place candles on the time axis. */
  intervalSeconds: number;
  liquidity: readonly LiquidityBin[];
  unit: ValueUnit;
  /** The draft range from Create Position, drawn as a band. */
  range: RangeInput | null;
  callouts: readonly Callout[];
  showCallouts: boolean;
  className?: string;
}

type Ohlc = Pick<Candle, 'open' | 'high' | 'low' | 'close'>;

/** Vertical reach above a candle's high that counts as hovering its callout marker. */
const MARKER_HIT_PX = 36;

const MARKER_TONE = { 'in-range': 'up', 'out-of-range': 'faint', closed: 'faint' } as const;

/**
 * Pool chart on TradingView lightweight-charts (brief 8.1, 8.2): candles and
 * volume with drag-to-pan and wheel/pinch zoom, callout markers, the draft range
 * as MIN/MAX lines plus a band, and liquidity bins at the right edge.
 */
export function PriceChart({
  pool,
  candles,
  intervalSeconds,
  liquidity,
  unit,
  range,
  callouts,
  showCallouts,
  className,
}: PriceChartProps) {
  const { containerRef, handles } = useLightweightChart();
  const [hovered, setHovered] = useState<Ohlc | null>(null);
  const [popover, setPopover] = useState<{ callout: Callout; x: number; y: number } | null>(null);
  const hasCandles = candles.length > 0;

  const convert = (priceUsd: number) => toUnit(priceUsd, unit, pool);
  const format = (value: number) => formatUnit(value, unit);

  const times = useMemo(() => {
    const anchor = Math.floor(Date.now() / 1000 / intervalSeconds) * intervalSeconds;
    return candles.map(
      (candle, index) => (
        candle.timestamp ?? anchor - (candles.length - 1 - index) * intervalSeconds
      ) as UTCTimestamp
    );
  }, [candles, intervalSeconds]);

  // Candles, volume and the axis formatter follow the selected unit.
  useEffect(() => {
    if (!handles) return;
    const { chart, candles: candleSeries, volume } = handles;
    const scale = unit === 'mcap' ? pool.supply : 1;

    chart.applyOptions({
      localization: { priceFormatter: (value: number) => formatUnit(value, unit) },
    });
    candleSeries.applyOptions({
      priceFormat: {
        type: 'custom',
        formatter: (value: number) => formatUnit(value, unit),
        minMove: unit === 'mcap' ? 1 : 1e-9,
      },
    });
    candleSeries.setData(
      candles.map((candle, index) => ({
        time: times[index] as UTCTimestamp,
        open: candle.open * scale,
        high: candle.high * scale,
        low: candle.low * scale,
        close: candle.close * scale,
      }))
    );
    volume.setData(
      candles.map((candle, index) => ({
        time: times[index] as UTCTimestamp,
        value: candle.volume,
        color: tokenColor(candle.close >= candle.open ? 'up' : 'down', 0.25),
      }))
    );
  }, [handles, candles, times, unit, pool.supply]);

  // Fit the whole series when the interval changes; keep the user's zoom otherwise.
  useEffect(() => {
    handles?.chart.timeScale().fitContent();
  }, [handles, times]);

  // Callout avatar markers at (time posted, value at post).
  useEffect(() => {
    if (!handles) return;
    const markers: SeriesMarker<UTCTimestamp>[] = showCallouts
      ? callouts
          .map(callout => ({ callout, index: candles.length - 1 - callout.candlesAgo }))
          .filter(({ index }) => index >= 0)
          .sort((a, b) => a.index - b.index)
          .map(({ callout, index }) => ({
            time: times[index] as UTCTimestamp,
            position: 'aboveBar',
            shape: 'circle',
            size: 1.4,
            id: callout.id,
            text: callout.caller.initials,
            color: tokenColor(
              callout.quickExitMinutes !== null ? 'down' : MARKER_TONE[calloutStatus(callout)]
            ),
          }))
      : [];
    handles.candles.setMarkers(markers);
  }, [handles, callouts, showCallouts, candles.length, times]);

  // MIN / MAX lines for the draft range.
  useEffect(() => {
    if (!handles || !range) return;
    const series = handles.candles;
    const bounds = [range.minPct, range.maxPct].map(pct =>
      toUnit(applyPct(pool.priceUsd, pct), unit, pool)
    );
    // Keep the whole range on screen when the chart autoscales.
    series.applyOptions({
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const info = original();
        if (!info?.priceRange) return info;
        const { minValue, maxValue } = info.priceRange;
        return {
          ...info,
          priceRange: {
            minValue: Math.min(minValue, ...bounds),
            maxValue: Math.max(maxValue, ...bounds),
          },
        };
      },
    });
    const lines: IPriceLine[] = [
      { title: 'MAX', pct: range.maxPct },
      { title: 'MIN', pct: range.minPct },
    ].map(({ title, pct }) =>
      series.createPriceLine({
        price: toUnit(applyPct(pool.priceUsd, pct), unit, pool),
        color: tokenColor('signal', 0.8),
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: true,
        title,
      })
    );
    return () => {
      lines.forEach(line => series.removePriceLine(line));
      series.applyOptions({
        autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => original(),
      });
    };
  }, [handles, range, unit, pool]);

  // OHLC legend follows the crosshair; hovering a marker opens its callout popover.
  useEffect(() => {
    if (!handles) return;
    const { chart, candles: candleSeries } = handles;
    const onMove: Parameters<typeof chart.subscribeCrosshairMove>[0] = param => {
      const data = param.seriesData.get(candleSeries);
      const bar = data && 'open' in data ? data : null;
      setHovered(bar);

      // A marker sits just above its candle's high; treat the pointer as on it when
      // it is over that candle and within the marker's band (brief 8.2 popover).
      const index = times.findIndex(time => time === param.time);
      const callout = callouts.find(item => candles.length - 1 - item.candlesAgo === index);
      const highY = bar ? candleSeries.priceToCoordinate(bar.high) : null;
      const onMarker =
        showCallouts &&
        callout &&
        param.point &&
        highY !== null &&
        param.point.y > highY - MARKER_HIT_PX &&
        param.point.y < highY + 4;
      setPopover(onMarker && param.point ? { callout, x: param.point.x, y: param.point.y } : null);
    };
    chart.subscribeCrosshairMove(onMove);
    return () => chart.unsubscribeCrosshairMove(onMove);
  }, [handles, callouts, times, candles.length, showCallouts]);

  const band = range
    ? ([
        convert(applyPct(pool.priceUsd, range.minPct)),
        convert(applyPct(pool.priceUsd, range.maxPct)),
      ] as const)
    : null;
  const current = convert(pool.priceUsd);
  // The hovered caller's range, in chart units, drawn as a dashed band (brief 8.2).
  const calloutBand = popover
    ? ([popover.callout.minPct, popover.callout.maxPct].map(pct =>
        convert((popover.callout.mcAtPostUsd * (1 + pct / 100)) / pool.supply)
      ) as [number, number])
    : null;
  const projection = useChartProjection(handles, band ?? [current * 0.9, current * 1.1]);
  const last = candles[candles.length - 1];
  const legend: Ohlc | null =
    hovered ??
    (last
      ? {
          open: convert(last.open),
          high: convert(last.high),
          low: convert(last.low),
          close: convert(last.close),
        }
      : null);

  return (
    <div className={cn('relative h-full w-full', className)}>
      {legend ? (
        <p className="t-label pointer-events-none absolute left-2 top-1 z-10 flex flex-wrap gap-x-3 text-muted">
          {(['open', 'high', 'low', 'close'] as const).map(key => (
            <span key={key}>
              {key[0]?.toUpperCase()} <span className="text-fg">{format(legend[key])}</span>
            </span>
          ))}
        </p>
      ) : null}

      <div
        ref={containerRef}
        role="img"
        aria-label={hasCandles
          ? `${pool.base} / ${pool.quote} chart, last ${format(current)}. Drag to pan, scroll or pinch to zoom.`
          : `${pool.base} / ${pool.quote} chart. No indexed price history yet.`}
        className="h-full w-full font-mono"
      />

      {!hasCandles ? (
        <div className="absolute inset-0 z-20 grid place-items-center overflow-hidden bg-bg/90 px-6 text-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgb(var(--fg)/0.12)_1px,transparent_1px),linear-gradient(90deg,rgb(var(--fg)/0.12)_1px,transparent_1px)] [background-size:44px_44px]"
          />
          <div className="relative flex max-w-md flex-col items-center">
            <span className="grid size-12 place-items-center rounded-full border border-line bg-panel-2 text-muted">
              <CandlestickChart aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </span>
            <div className="mt-4">
              <TokenPair tokenX={pool.tokenX} tokenY={pool.tokenY} compact />
            </div>
            <h2 className="mt-4 text-lg font-medium">No price history yet</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              This pool has no confirmed swaps in the selected interval. The chart will appear automatically after the first indexed trade.
            </p>
            <p className="t-label mt-5 border border-line bg-panel-2 px-3 py-2 text-faint">
              Waiting for the first swap · no demo data
            </p>
          </div>
        </div>
      ) : null}

      {hasCandles && projection ? (
        <ChartOverlay
          projection={projection}
          band={band}
          calloutBand={calloutBand}
          liquidity={liquidity}
          priceToValue={convert}
        />
      ) : null}

      {hasCandles && popover ? <CalloutPopover {...popover} /> : null}

      {showCallouts ? (
        <ul className="sr-only">
          {callouts.map(callout => (
            <li key={callout.id}>
              {`@${callout.caller.handle}: ${sideLabel(callout)}, ${rangeLabel(callout)}`}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
