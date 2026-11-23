import type { Projection } from '../hooks/useChartProjection';
import type { LiquidityBin } from '../model/pool';

interface ChartOverlayProps {
  projection: Projection;
  /** Draft range in chart units, [low, high]. */
  band: readonly [number, number] | null;
  /** Hovered caller's range in chart units, dashed. */
  calloutBand: readonly [number, number] | null;
  liquidity: readonly LiquidityBin[];
  /** Converts a USD price to the chart unit. */
  priceToValue: (priceUsd: number) => number;
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
}: ChartOverlayProps) {
  const { toY, plotWidth } = projection;
  const maxDepth = Math.max(1, ...liquidity.map(bin => bin.depthUsd));
  const bandTop = band ? toY(band[1]) : null;
  const bandBottom = band ? toY(band[0]) : null;
  const calloutTop = calloutBand ? toY(calloutBand[1]) : null;
  const calloutBottom = calloutBand ? toY(calloutBand[0]) : null;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 h-full"
      width={plotWidth}
    >
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

      {liquidity.map((bin, index) => {
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
      })}
    </svg>
  );
}
