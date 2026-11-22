import type { ChartMarker, MarkerTone } from '@/content/landing';
import { seededRandom } from '@/lib/bins';
import { cn } from '@/lib/cn';

interface MarketChartProps {
  markers: readonly ChartMarker[];
  /** Index into `markers` whose range is drawn as a dashed band. */
  focus?: number | undefined;
  /** Indexes rendered at full strength; others fade. Defaults to all. */
  highlight?: readonly number[] | undefined;
  seed?: number;
  className?: string;
  title: string;
}

const W = 1600;
const H = 640;
const PAD = { top: 40, right: 220, bottom: 56, left: 24 };
const POINTS = 140;
const BIN_ROWS = 34;

const RING: Record<MarkerTone, string> = {
  up: 'stroke-up',
  faint: 'stroke-faint',
  down: 'stroke-down',
  warn: 'stroke-warn',
};

/** Deterministic illustrative price series in 0..1. */
function buildSeries(seed: number): number[] {
  const random = seededRandom(seed);
  const series: number[] = [];
  let value = 0.3;
  for (let i = 0; i < POINTS; i++) {
    const drift = Math.sin(i / 18) * 0.004 + 0.0008;
    value = Math.min(0.92, Math.max(0.08, value + drift + (random() - 0.5) * 0.045));
    series.push(value);
  }
  return series;
}

const plotWidth = W - PAD.left - PAD.right;
const plotHeight = H - PAD.top - PAD.bottom;
const xAt = (t: number) => PAD.left + t * plotWidth;
const yAt = (v: number) => PAD.top + (1 - v) * plotHeight;

/**
 * Pool chart illustration with the callout layer from brief 8.2: avatar markers
 * at (time posted, MC at post), ring color for range status, the focused
 * caller's range as a dashed band, and the liquidity-bin histogram on the right edge.
 */
export function MarketChart({
  markers,
  focus,
  highlight,
  seed = 7,
  className,
  title,
}: MarketChartProps) {
  const series = buildSeries(seed);
  const random = seededRandom(seed + 1);
  const bins = Array.from({ length: BIN_ROWS }, (_, row) => {
    const center = 1 - Math.abs(row / (BIN_ROWS - 1) - 0.45) * 1.6;
    return Math.max(0.08, center * 0.8 + random() * 0.35);
  });

  const path = series
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i / (POINTS - 1)).toFixed(1)},${yAt(v).toFixed(1)}`)
    .join(' ');
  const last = series[series.length - 1] ?? 0.5;
  const focused = focus === undefined ? undefined : markers[focus];
  const isStrong = (index: number) => !highlight || highlight.includes(index);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={title}
      className={cn('block h-auto w-full', className)}
    >
      {[0.25, 0.5, 0.75].map(g => (
        <line
          key={g}
          x1={PAD.left}
          x2={W - PAD.right}
          y1={yAt(g)}
          y2={yAt(g)}
          className="stroke-fg/[0.06]"
        />
      ))}

      {focused ? (
        <g className="transition-opacity duration-base">
          <rect
            x={xAt(focused.at)}
            width={W - PAD.right - xAt(focused.at)}
            y={yAt(focused.range[1])}
            height={yAt(focused.range[0]) - yAt(focused.range[1])}
            className="fill-signal/[0.06] stroke-signal/60"
            strokeDasharray="6 6"
          />
        </g>
      ) : null}

      {bins.map((weight, row) => {
        const rowHeight = plotHeight / BIN_ROWS;
        const y = PAD.top + row * rowHeight;
        const below = 1 - row / BIN_ROWS < last;
        return (
          <rect
            key={row}
            x={W - PAD.right + 24}
            y={y + 1}
            width={weight * (PAD.right - 48)}
            height={rowHeight - 2}
            className={below ? 'fill-signal/35' : 'fill-fg/15'}
          />
        );
      })}

      <path d={path} fill="none" strokeWidth="2" className="stroke-fg/80" />

      <g>
        <line
          x1={PAD.left}
          x2={W - PAD.right + 16}
          y1={yAt(last)}
          y2={yAt(last)}
          className="stroke-signal"
          strokeDasharray="2 6"
        />
        <rect
          x={W - PAD.right - 92}
          y={yAt(last) - 15}
          width="92"
          height="30"
          rx="2"
          className="fill-signal"
        />
        <text
          x={W - PAD.right - 46}
          y={yAt(last) + 5}
          textAnchor="middle"
          className="fill-on-signal font-mono text-[15px]"
        >
          $4.89M
        </text>
      </g>

      {markers.map((marker, index) => {
        const value = series[Math.round(marker.at * (POINTS - 1))] ?? 0.5;
        const strong = isStrong(index);
        return (
          <g
            key={marker.label}
            transform={`translate(${xAt(marker.at)}, ${yAt(value)})`}
            className={cn(
              'transition-opacity duration-base',
              strong ? 'opacity-100' : 'opacity-25'
            )}
          >
            <circle r="17" className="fill-panel-2" />
            <circle
              r="17"
              fill="none"
              strokeWidth={index === focus ? 4 : 3}
              className={RING[marker.tone]}
            />
            <text y="5" textAnchor="middle" className="fill-fg font-mono text-[13px]">
              {marker.label}
            </text>
          </g>
        );
      })}

      <text
        x={PAD.left}
        y={H - 18}
        className="fill-muted font-mono text-[14px] uppercase tracking-[0.06em]"
      >
        HOODIE / USDG · MCap · 1h
      </text>
      <text
        x={W - PAD.right + 24}
        y={H - 18}
        className="fill-muted font-mono text-[14px] uppercase tracking-[0.06em]"
      >
        Bins
      </text>
    </svg>
  );
}
