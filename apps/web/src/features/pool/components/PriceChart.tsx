'use client';

import {
  LineStyle,
  type AutoscaleInfo,
  type IPriceLine,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useMemo, useState } from 'react';

import { Avatar } from '@/components/ui/Avatar';
import { CandlestickChart } from '@/components/ui/icons';
import { TokenPair } from '@/components/ui/TokenPair';
import { rangeLabel, sideLabel, type Callout } from '@/features/callouts/model/callout';
import { cn } from '@/lib/cn';
import { tokenColor } from '@/lib/theme';
import type { BinShape } from '@/types/callout';

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
  range: (RangeInput & { shape: BinShape; presetId?: string | null }) | null;
  onRangeChange?: (bound: 'minPct' | 'maxPct', value: number) => void;
  callouts: readonly Callout[];
  showCallouts: boolean;
  className?: string;
}

type Ohlc = Pick<Candle, 'open' | 'high' | 'low' | 'close'>;

function calloutCandleIndex(callout: Callout, times: readonly UTCTimestamp[]): number {
  if (times.length === 0) return -1;
  const target = Math.floor(new Date(callout.createdAt).getTime() / 1_000);
  let closest = 0;
  let distance = Number.POSITIVE_INFINITY;
  times.forEach((time, index) => {
    const candidate = Math.abs(Number(time) - target);
    if (candidate < distance) {
      closest = index;
      distance = candidate;
    }
  });
  return closest;
}

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
  onRangeChange,
  callouts,
  showCallouts,
  className,
}: PriceChartProps) {
  const { containerRef, handles } = useLightweightChart();
  const [hovered, setHovered] = useState<Ohlc | null>(null);
  const [popover, setPopover] = useState<{ callout: Callout; x: number; y: number } | null>(null);
  const [avatarMarkers, setAvatarMarkers] = useState<readonly { callout: Callout; x: number; y: number }[]>([]);
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

  // Lightweight Charts markers cannot render images, so canonical X avatars are
  // projected into a DOM overlay and kept aligned while the user pans or zooms.
  useEffect(() => {
    if (!handles || !showCallouts) {
      setAvatarMarkers([]);
      return;
    }
    const { chart, candles: candleSeries } = handles;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const projected = callouts.flatMap(callout => {
          const index = calloutCandleIndex(callout, times);
          const time = times[index];
          if (index < 0 || time === undefined) return [];
          const x = chart.timeScale().timeToCoordinate(time);
          const value = toUnit(callout.mcAtPostUsd, unit, pool);
          const y = candleSeries.priceToCoordinate(value);
          return x === null || y === null ? [] : [{ callout, x, y }];
        }).sort((a, b) => a.x - b.x || a.y - b.y);
        const stacked: { callout: Callout; x: number; y: number }[] = [];
        projected.forEach(marker => {
          let y: number = marker.y;
          for (let previous = stacked.length - 1; previous >= 0; previous -= 1) {
            const other = stacked[previous];
            if (!other || marker.x - other.x > 32) break;
            if (Math.abs(y - other.y) < 30) y = other.y - 30;
          }
          stacked.push({ ...marker, y });
        });
        setAvatarMarkers(stacked);
      });
    };
    update();
    chart.timeScale().subscribeVisibleLogicalRangeChange(update);
    const resize = new ResizeObserver(update);
    if (containerRef.current) resize.observe(containerRef.current);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(update);
    };
  }, [handles, showCallouts, callouts, candles.length, times, unit, pool, containerRef]);

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

      const marker = showCallouts && param.point
        ? avatarMarkers.find(item => Math.hypot(item.x - param.point!.x, item.y - param.point!.y) <= 18)
        : null;
      setPopover(marker ? { callout: marker.callout, x: marker.x, y: marker.y } : null);
    };
    chart.subscribeCrosshairMove(onMove);
    return () => chart.unsubscribeCrosshairMove(onMove);
  }, [handles, avatarMarkers, showCallouts]);

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
  const dragRange = (bound: 'minPct' | 'maxPct', y: number, phase: 'start' | 'move' | 'end') => {
    if (!handles || !range || !onRangeChange) return;
    if (phase === 'start') {
      handles.chart.applyOptions({ handleScroll: false, handleScale: false });
      handles.chart.priceScale('right').applyOptions({ autoScale: false });
    }
    const chartValue = handles.candles.coordinateToPrice(y);
    if (chartValue !== null) {
      const price = unit === 'mcap' ? chartValue / pool.supply : chartValue;
      onRangeChange(bound, ((price / pool.priceUsd) - 1) * 100);
    }
    if (phase === 'end') {
      handles.chart.applyOptions({
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: true,
      });
      handles.chart.priceScale('right').applyOptions({ autoScale: true });
    }
  };
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
              <TokenPair tokenX={pool.baseAddress} tokenY={pool.quoteAddress} compact />
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
          range={range}
          binStepBps={pool.binStepBps}
          {...(onRangeChange ? { onRangeDrag: dragRange } : {})}
        />
      ) : null}

      {hasCandles && showCallouts ? avatarMarkers.map(({ callout, x, y }) => (
        <span
          key={callout.id}
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2"
          style={{ left: x, top: y }}
        >
          <Avatar
            seed={callout.caller.handle}
            src={callout.caller.avatarUrl}
            alt=""
            size="sm"
          />
        </span>
      )) : null}

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
