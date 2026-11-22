'use client';

import { useMemo, useState } from 'react';

import { useAllCallouts } from '@/features/callouts/useAllCallouts';

import { usePositionDraft } from '../hooks/usePositionDraft';
import type { ValueUnit } from '../model/format';
import { buildCandles, buildLiquidity, featuredPool } from '../model/pool';

import { ChartToolbar, INTERVAL_SECONDS, type ChartInterval } from './ChartToolbar';
import { MarketStrips } from './MarketStrips';
import { PoolHeader } from './PoolHeader';
import { PoolTabs } from './PoolTabs';
import { PriceChart } from './PriceChart';
import { TradePanel, type PanelTab } from './TradePanel';

const CANDLE_COUNT: Record<ChartInterval, number> = { '5m': 96, '15m': 80, '1h': 64, '4h': 48 };
const CANDLE_SEED: Record<ChartInterval, number> = { '5m': 11, '15m': 23, '1h': 37, '4h': 41 };
const liquidity = buildLiquidity(40);

/**
 * The pool page (brief 8): header, strips, chart, Create Position / Swap and the
 * pool tabs. Owns the shared state: chart unit and the position draft, which the
 * chart draws as a band.
 */
export function PoolTerminal() {
  const pool = featuredPool;
  const [interval, setChartInterval] = useState<ChartInterval>('15m');
  const [unit, setUnit] = useState<ValueUnit>('mcap');
  const [showCallouts, setShowCallouts] = useState(true);
  const [showBins, setShowBins] = useState(true);
  const [panelTab, setPanelTab] = useState<PanelTab>('create');
  const position = usePositionDraft(pool);
  const { own, others } = useAllCallouts();

  const candles = useMemo(
    () => buildCandles(CANDLE_COUNT[interval], pool.priceUsd, CANDLE_SEED[interval]),
    [interval, pool.priceUsd]
  );

  return (
    <div className="flex flex-col gap-4 px-gutter py-5">
      <PoolHeader pool={pool} />
      <MarketStrips />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-rows-[auto_1fr]">
        <section aria-label="Chart" className="min-w-0">
          <ChartToolbar
            interval={interval}
            onIntervalChange={setChartInterval}
            unit={unit}
            onUnitChange={setUnit}
            showCallouts={showCallouts}
            onShowCalloutsChange={setShowCallouts}
            showBins={showBins}
            onShowBinsChange={setShowBins}
          />
          <div className="h-[320px] border border-line bg-panel sm:h-[440px]">
            <PriceChart
              pool={pool}
              candles={candles}
              intervalSeconds={INTERVAL_SECONDS[interval]}
              liquidity={showBins ? liquidity : []}
              unit={unit}
              range={panelTab === 'create' ? position.draft : null}
              callouts={own.concat(others)}
              showCallouts={showCallouts}
            />
          </div>
        </section>

        <aside
          aria-label="Trade panel"
          className="scroll-mt-20 self-start border border-line bg-panel xl:sticky xl:top-20 xl:row-span-2"
        >
          <TradePanel
            pool={pool}
            unit={unit}
            position={position}
            tab={panelTab}
            onTabChange={setPanelTab}
          />
        </aside>

        <PoolTabs pool={pool} />
      </div>
    </div>
  );
}
