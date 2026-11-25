import type { PointerEvent } from 'react';

import { binWeights, SHAPE_LABEL } from '@/lib/bins';
import type { BinShape } from '@/types/callout';

import type { Projection } from '../hooks/useChartProjection';
import type { LiquidityBin } from '../model/pool';
import { binCount, pricePosition, type RangeInput } from '../model/range';

type ChartRange = RangeInput & { shape: BinShape; presetId?: string | null };

interface ChartOverlayProps {
  projection: Projection;
  /** Draft range in chart units, [low, high]. */
  band: readonly [number, number] | null;
  /** Hovered caller's range in chart units, dashed. */
  calloutBand: readonly [number, number] | null;
  liquidity: readonly LiquidityBin[];
  /** Converts a USD price to the chart unit. */
  priceToValue: (priceUsd: number) => number;
  range: ChartRange | null;
  binStepBps: number;
  onRangeDrag?: (bound: 'minPct' | 'maxPct', y: number, phase: 'start' | 'move' | 'end') => void;
}

const BINS_WIDTH = 64;

/**
 * SVG drawn over the chart canvas, aligned through the chart's own price scale:
 * the draft range band and the pool's liquidity bins at the plot's right edge.
 */
export function ChartOverlay({
  projection,
  band,
  calloutBand,
  liquidity,
  priceToValue,
  range,
  binStepBps,
  onRangeDrag,
}: ChartOverlayProps) {
  const { toY, plotWidth } = projection;
  const maxDepth = Math.max(1, ...liquidity.map(bin => bin.depthUsd));
  const bandTop = band ? toY(band[1]) : null;
  const bandBottom = band ? toY(band[0]) : null;
  const calloutTop = calloutBand ? toY(calloutBand[1]) : null;
  const calloutBottom = calloutBand ? toY(calloutBand[0]) : null;
  const draftBins = range ? Math.max(1, binCount(range, binStepBps)) : 0;
  const draftPricePosition = range ? pricePosition(range) : 0;
  const draftActiveIndex = Math.max(0, Math.min(draftBins - 1, Math.round(draftPricePosition * (draftBins - 1))));
  const draftWeights = range ? binWeights(range.shape, draftBins, draftActiveIndex) : [];
  const draftMaxWidth = Math.min(112, plotWidth * 0.16);
  const draftRailX = plotWidth - draftMaxWidth - 14;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden={!onRangeDrag}>
    <svg className="absolute left-0 top-0 h-full" width={plotWidth} aria-hidden="true">
      {bandTop !== null && bandBottom !== null ? (
        <rect
          x={0}
          y={bandTop}
          width={plotWidth}
          height={Math.max(1, bandBottom - bandTop)}
          className="fill-signal/[0.07]"
        />
      ) : null}

      {calloutTop !== null && calloutBottom !== null ? (
        <rect
          x={0}
          y={calloutTop}
          width={plotWidth}
          height={Math.max(1, calloutBottom - calloutTop)}
          strokeDasharray="5 5"
          className="fill-fg/[0.05] stroke-fg/60"
        />
      ) : null}

      {!range ? liquidity.map((bin, index) => {
        if (bin.priceQuote === null) return null;
        const adjacent = liquidity[index + 1]?.priceQuote ?? liquidity[index - 1]?.priceQuote;
        const otherEdge = adjacent === null || adjacent === undefined
          ? bin.priceQuote
          : bin.priceQuote + Math.abs(adjacent - bin.priceQuote);
        const yFirst = toY(priceToValue(bin.priceQuote));
        const ySecond = toY(priceToValue(otherEdge));
        const yLow = yFirst === null || ySecond === null ? null : Math.max(yFirst, ySecond);
        const yHigh = yFirst === null || ySecond === null ? null : Math.min(yFirst, ySecond);
        if (yLow === null || yHigh === null) return null;
        const width = (bin.depthUsd / maxDepth) * BINS_WIDTH;
        return (
          <rect
            key={bin.offset}
            x={plotWidth - width}
            y={yHigh}
            width={width}
            height={Math.max(1, yLow - yHigh - 1)}
            className={bin.side === 'active' ? 'fill-signal/70' : bin.side === 'quote' ? 'fill-signal/35' : 'fill-fg/20'}
          />
        );
      }) : null}

      {range && bandTop !== null && bandBottom !== null ? (
        <g>
          <line
            x1={draftRailX}
            x2={draftRailX}
            y1={bandTop}
            y2={bandBottom}
            className="stroke-signal/70"
            strokeWidth={1.5}
          />
          <line x1={draftRailX - 5} x2={draftRailX + 5} y1={bandTop} y2={bandTop} className="stroke-signal" strokeWidth={2} />
          <line x1={draftRailX - 5} x2={draftRailX + 5} y1={bandBottom} y2={bandBottom} className="stroke-signal" strokeWidth={2} />
          {draftWeights.map((weight, index) => {
            const bandHeight = Math.max(1, bandBottom - bandTop);
            const rowHeight = bandHeight / draftWeights.length;
            const width = Math.max(2, weight * draftMaxWidth);
            const belowPrice = index < draftActiveIndex;
            return (
              <rect
                key={index}
                x={plotWidth - width}
                y={bandBottom - ((index + 1) * rowHeight)}
                width={width}
                height={Math.max(1, rowHeight - 1)}
                className={belowPrice ? 'fill-signal/65' : index === draftActiveIndex ? 'fill-signal' : 'fill-fg/35'}
              />
            );
          })}
          <text
            x={plotWidth - 6}
            y={Math.max(14, bandTop - 7)}
            textAnchor="end"
            className="fill-muted text-[10px] uppercase tracking-[0.12em]"
          >
            {SHAPE_LABEL[range.shape]} · {draftBins} bins
          </text>
        </g>
      ) : null}
    </svg>
    {range && bandTop !== null && bandBottom !== null && onRangeDrag ? (
      <>
        <RangeHandle
          bound="maxPct"
          label={`MAX ${range.maxPct >= 0 ? '+' : ''}${Math.round(range.maxPct)}%`}
          y={bandTop}
          plotWidth={plotWidth}
          onDrag={onRangeDrag}
        />
        <RangeHandle
          bound="minPct"
          label={`MIN ${range.minPct >= 0 ? '+' : ''}${Math.round(range.minPct)}%`}
          y={bandBottom}
          plotWidth={plotWidth}
          onDrag={onRangeDrag}
        />
      </>
    ) : null}
    </div>
  );
}

interface RangeHandleProps {
  bound: 'minPct' | 'maxPct';
  label: string;
  y: number;
  plotWidth: number;
  onDrag: (bound: 'minPct' | 'maxPct', y: number, phase: 'start' | 'move' | 'end') => void;
}

function RangeHandle({ bound, label, y, plotWidth, onDrag }: RangeHandleProps) {
  const move = (event: PointerEvent<HTMLButtonElement>, phase: 'start' | 'move' | 'end') => {
    const top = event.currentTarget.parentElement?.getBoundingClientRect().top ?? 0;
    onDrag(bound, event.clientY - top, phase);
  };
  return (
    <button
      type="button"
      aria-label={`Adjust ${bound === 'minPct' ? 'minimum' : 'maximum'} position range`}
      className="group pointer-events-auto absolute left-0 z-20 h-8 cursor-ns-resize touch-none text-left focus-visible:outline-none"
      style={{ top: y - 16, width: plotWidth }}
      onPointerDown={event => {
        event.currentTarget.setPointerCapture(event.pointerId);
        move(event, 'start');
      }}
      onPointerMove={event => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event, 'move');
      }}
      onPointerUp={event => {
        move(event, 'end');
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={event => move(event, 'end')}
    >
      <span className="absolute left-28 right-0 top-1/2 border-t-2 border-signal/80 transition group-hover:border-signal group-focus-visible:border-signal" />
      <span className="t-label absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-[2px] border border-signal/70 bg-[rgb(var(--panel-2))] px-2 py-1 text-signal shadow-lg">
        {label}
      </span>
    </button>
  );
}
