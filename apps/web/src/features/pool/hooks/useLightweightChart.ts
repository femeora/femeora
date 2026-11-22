'use client';

import {
  ColorType,
  createChart,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';

import { tokenColor } from '@/lib/theme';

export interface ChartHandles {
  chart: IChartApi;
  candles: ISeriesApi<'Candlestick'>;
  volume: ISeriesApi<'Histogram'>;
}

/**
 * Creates a TradingView lightweight-chart in `containerRef` with candle and volume
 * series styled from the design tokens. Pan with drag, zoom with wheel or pinch.
 * Returns `null` until the chart exists (client only).
 */
export function useLightweightChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [handles, setHandles] = useState<ChartHandles | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const grid = tokenColor('fg', 0.06);
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: tokenColor('muted'),
        fontFamily: getComputedStyle(container).fontFamily,
        fontSize: 11,
      },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: {
        borderColor: tokenColor('fg', 0.12),
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: tokenColor('fg', 0.12),
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
      },
      // Vertical swipes keep scrolling the page on touch devices; horizontal drag pans.
      handleScroll: { vertTouchDrag: false },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: tokenColor('fg', 0.3),
          style: LineStyle.Dashed,
          labelBackgroundColor: tokenColor('panel-2'),
        },
        horzLine: {
          color: tokenColor('fg', 0.3),
          style: LineStyle.Dashed,
          labelBackgroundColor: tokenColor('panel-2'),
        },
      },
    });

    const candles = chart.addCandlestickSeries({
      upColor: tokenColor('up'),
      downColor: tokenColor('down'),
      borderVisible: false,
      wickUpColor: tokenColor('up'),
      wickDownColor: tokenColor('down'),
      priceLineColor: tokenColor('signal'),
      priceLineStyle: LineStyle.Dotted,
    });

    const volume = chart.addHistogramSeries({
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });

    setHandles({ chart, candles, volume });
    return () => {
      setHandles(null);
      chart.remove();
    };
  }, []);

  return { containerRef, handles };
}
