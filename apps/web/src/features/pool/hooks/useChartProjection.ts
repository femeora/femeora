'use client';

import { useEffect, useState } from 'react';

import type { ChartHandles } from './useLightweightChart';

export interface Projection {
  /** Pixel y for a value on the candle price scale, or null when off-screen. */
  toY: (value: number) => number | null;
  /** Width of the plot area, excluding the price scale. */
  plotWidth: number;
}

/**
 * Re-derives the price-to-pixel mapping whenever the chart pans, zooms or resizes,
 * so DOM/SVG overlays stay aligned with the canvas. Checks once per frame and only
 * re-renders when the mapping actually changed.
 */
export function useChartProjection(handles: ChartHandles | null, probe: readonly [number, number]) {
  const [projection, setProjection] = useState<Projection | null>(null);
  const [low, high] = probe;

  useEffect(() => {
    if (!handles) return;
    let frame = 0;
    let lastKey = '';

    const tick = () => {
      const { chart, candles } = handles;
      const plotWidth = chart.timeScale().width();
      const key = `${candles.priceToCoordinate(low)}|${candles.priceToCoordinate(high)}|${plotWidth}`;
      if (key !== lastKey) {
        lastKey = key;
        setProjection({ toY: value => candles.priceToCoordinate(value), plotWidth });
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [handles, low, high]);

  return projection;
}
