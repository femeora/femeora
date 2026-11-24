'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { useToast } from '@/components/feedback/toast';
import type { Callout } from '@/features/callouts/model/callout';
import { useAllCallouts } from '@/features/callouts/useAllCallouts';
import { openApiEventStream } from '@/lib/api/realtime';

import { usePositionDraft } from '../hooks/usePositionDraft';
import type { ValueUnit } from '../model/format';
import type { LiveLp, LivePoolStats, LiveTrade } from '../model/live';
import type { Candle, LiquidityBin, Pool } from '../model/pool';

import { ChartToolbar, INTERVAL_SECONDS, type ChartInterval } from './ChartToolbar';
import { MarketStrips } from './MarketStrips';
import { PoolHeader } from './PoolHeader';
import { PoolTabs } from './PoolTabs';
import { PriceChart } from './PriceChart';
import { TradePanel, type PanelTab } from './TradePanel';

interface PoolTerminalProps {
  pool: Pool;
  stats: LivePoolStats;
  candlesByInterval: Readonly<Record<ChartInterval, readonly Candle[]>>;
  liquidity: readonly LiquidityBin[];
  trades: readonly LiveTrade[];
  lps: readonly LiveLp[];
  callouts: readonly Callout[];
}

/**
 * The pool page (brief 8): header, strips, chart, Create Position / Swap and the
 * pool tabs. Owns the shared state: chart unit and the position draft, which the
 * chart draws as a band.
 */
export function PoolTerminal({
  pool,
  stats,
  candlesByInterval,
  liquidity,
  trades,
  lps,
  callouts,
}: PoolTerminalProps) {
  const router = useRouter();
  const showToast = useToast(state => state.show);
  const [interval, setChartInterval] = useState<ChartInterval>('15m');
  const [unit, setUnit] = useState<ValueUnit>(pool.marketCapAvailable ? 'mcap' : 'price');
  const [showCallouts, setShowCallouts] = useState(true);
  const [showBins, setShowBins] = useState(true);
  const [panelTab, setPanelTab] = useState<PanelTab>('create');
  const position = usePositionDraft(pool);
  const { own } = useAllCallouts(false);
  const candles = useMemo(() => candlesByInterval[interval], [candlesByInterval, interval]);

  useEffect(() => openApiEventStream(`/v1/pools/${pool.address}/stream`, {
    onMessage: message => {
      if (message.topic !== 'pool.cap') return;
      const payload = message.payload;
      const record = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : null;
      const status = record && typeof record.status === 'string'
        ? record.status
        : 'unavailable';
      const utilizationBps = record && typeof record.utilizationBps === 'number'
        ? record.utilizationBps
        : null;
      const usage = utilizationBps === null ? '' : ` (${(utilizationBps / 100).toFixed(2)}%)`;
      if (status === 'critical') {
        showToast(`Liquidity reserve usage is critical${usage}. New deposits or swaps may reach the configured safety limit.`, {
          title: 'Pool reserve limit',
          tone: 'error',
          userFacing: true,
        });
      } else if (status === 'warning') {
        showToast(`Liquidity reserve usage is approaching its safety limit${usage}.`, {
          title: 'Pool reserve warning',
          tone: 'info',
        });
      } else if (status === 'normal') {
        showToast('Liquidity reserve usage has returned to the normal range.', {
          title: 'Pool reserve recovered',
          tone: 'success',
        });
      }
      router.refresh();
    },
  }), [pool.address, router, showToast]);

  return (
    <div className="flex flex-col gap-4 px-gutter py-5">
      <PoolHeader pool={pool} />
      <MarketStrips stats={stats} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-rows-[auto_1fr]">
        <section aria-label="Chart" className="min-w-0">
          <ChartToolbar
            interval={interval}
            onIntervalChange={setChartInterval}
            unit={unit}
            onUnitChange={setUnit}
            marketCapAvailable={pool.marketCapAvailable}
            showCallouts={showCallouts}
            onShowCalloutsChange={setShowCallouts}
            showBins={showBins}
            onShowBinsChange={setShowBins}
          />
          <div className="glass h-[320px] rounded-[2px] sm:h-[440px]">
            <PriceChart
              pool={pool}
              candles={candles}
              intervalSeconds={INTERVAL_SECONDS[interval]}
              liquidity={showBins ? liquidity : []}
              unit={unit}
              range={panelTab === 'create' ? position.draft : null}
              callouts={own.concat(callouts)}
              showCallouts={showCallouts}
            />
          </div>
        </section>

        <aside
          aria-label="Trade panel"
          className="glass scroll-mt-20 self-start rounded-[2px] xl:sticky xl:top-20 xl:row-span-2"
        >
          <TradePanel
            pool={pool}
            unit={unit}
            position={position}
            tab={panelTab}
            onTabChange={setPanelTab}
          />
        </aside>

        <PoolTabs pool={pool} trades={trades} lps={lps} callouts={callouts} />
      </div>
    </div>
  );
}
