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
import { fromContractBinBounds, toContractBinBounds } from '../model/orientation';
import type { Candle, LiquidityBin, Pool } from '../model/pool';
import { snapRangeBound } from '../model/range';

import { ChartToolbar, INTERVAL_SECONDS, type ChartInterval } from './ChartToolbar';
import { MarketStrips } from './MarketStrips';
import { PoolHeader, type PoolPriceWarning } from './PoolHeader';
import { PoolTabs } from './PoolTabs';
import { PriceChart } from './PriceChart';
import { TradePanel, type PanelTab } from './TradePanel';

interface PoolTerminalProps {
  pool: Pool;
  stats: LivePoolStats;
  candlesBySource: Readonly<
    Record<'pool' | 'reference', Readonly<Record<ChartInterval, readonly Candle[]>>>
  >;
  liquidity: readonly LiquidityBin[];
  trades: readonly LiveTrade[];
  lps: readonly LiveLp[];
  callouts: readonly Callout[];
  priceWarning: PoolPriceWarning | null;
}

/**
 * The pool page (brief 8): header, strips, chart, Create Position / Swap and the
 * pool tabs. Owns the shared state: chart unit and the position draft, which the
 * chart draws as a band.
 */
export function PoolTerminal({
  pool,
  stats,
  candlesBySource,
  liquidity,
  trades,
  lps,
  callouts,
  priceWarning,
}: PoolTerminalProps) {
  const router = useRouter();
  const showToast = useToast(state => state.show);
  const [interval, setChartInterval] = useState<ChartInterval>('1h');
  const [unit, setUnit] = useState<ValueUnit>(pool.marketCapAvailable ? 'mcap' : 'price');
  const [showCallouts, setShowCallouts] = useState(true);
  const [showBins, setShowBins] = useState(true);
  const [chartSource, setChartSource] = useState<'combined' | 'pool' | 'reference'>('combined');
  const [panelTab, setPanelTab] = useState<PanelTab>('create');
  const position = usePositionDraft(pool);
  const { own } = useAllCallouts(false);
  const referenceAvailable = candlesBySource.reference[interval].length > 0;
  const candles = useMemo(() => {
    if (chartSource === 'pool') return candlesBySource.pool[interval];
    if (chartSource === 'reference') return candlesBySource.reference[interval];
    return candlesBySource.reference[interval].length > 0
      ? candlesBySource.reference[interval]
      : candlesBySource.pool[interval];
  }, [candlesBySource, chartSource, interval]);

  useEffect(() => {
    let refreshTimer: number | null = null;
    let reconciliationTimer: number | null = null;
    let reconciliationDeadline = 0;
    let pendingTransactionHash: string | null = null;
    let pendingPositionIndexed = false;
    let pendingCalloutIndexed = false;
    let pendingExpectsCallout = false;
    const queuePoolRefresh = () => {
      if (refreshTimer !== null) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        router.refresh();
      }, 500);
    };
    const stopReconciliation = () => {
      if (reconciliationTimer !== null) window.clearInterval(reconciliationTimer);
      reconciliationTimer = null;
      reconciliationDeadline = 0;
      pendingTransactionHash = null;
      pendingPositionIndexed = false;
      pendingCalloutIndexed = false;
      pendingExpectsCallout = false;
    };
    const reconciliationComplete = () =>
      pendingPositionIndexed && (!pendingExpectsCallout || pendingCalloutIndexed);
    const reconcileConfirmedPosition = () => {
      window.dispatchEvent(
        new CustomEvent('fomeora:pool-update', { detail: { pool: pool.address } })
      );
      queuePoolRefresh();
      if (Date.now() >= reconciliationDeadline) stopReconciliation();
    };
    const onPositionConfirmed = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          pool?: string;
          transactionHash?: string;
          expectsCallout?: boolean;
        }>
      ).detail;
      if (detail?.pool?.toLowerCase() !== pool.address.toLowerCase()) return;
      stopReconciliation();
      pendingTransactionHash = detail.transactionHash?.toLowerCase() ?? null;
      pendingExpectsCallout = detail.expectsCallout === true;
      reconciliationDeadline = Date.now() + 120_000;
      reconcileConfirmedPosition();
      reconciliationTimer = window.setInterval(reconcileConfirmedPosition, 4_000);
    };
    const positionTopics = new Set([
      'position.created',
      'position.increased',
      'position.decreased',
      'position.closed',
      'position.transferred',
    ]);
    const stop = openApiEventStream(`/v1/pools/${pool.address}/stream`, {
      onMessage: message => {
        const payload =
          typeof message.payload === 'object' &&
          message.payload !== null &&
          !Array.isArray(message.payload)
            ? (message.payload as Record<string, unknown>)
            : null;
        const eventTransactionHash =
          payload && typeof payload.transactionHash === 'string'
            ? payload.transactionHash.toLowerCase()
            : null;
        const matchesPendingTransaction =
          pendingTransactionHash === null || eventTransactionHash === pendingTransactionHash;
        if (message.topic === 'pool.cap') {
          const record = payload;
          const status =
            record && typeof record.status === 'string' ? record.status : 'unavailable';
          const utilizationBps =
            record && typeof record.utilizationBps === 'number' ? record.utilizationBps : null;
          const usage = utilizationBps === null ? '' : ` (${(utilizationBps / 100).toFixed(2)}%)`;
          if (status === 'critical') {
            showToast(
              `Liquidity reserve usage is critical${usage}. New deposits or swaps may reach the configured safety limit.`,
              {
                title: 'Pool reserve limit',
                tone: 'error',
                userFacing: true,
              }
            );
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
        }
        if (positionTopics.has(message.topic)) {
          if (message.topic === 'position.created' && matchesPendingTransaction) {
            pendingPositionIndexed = true;
          }
          window.dispatchEvent(
            new CustomEvent('fomeora:pool-update', { detail: { pool: pool.address } })
          );
        }
        if (message.topic === 'callout.new') {
          if (matchesPendingTransaction) pendingCalloutIndexed = true;
          window.dispatchEvent(
            new CustomEvent('fomeora:pool-update', { detail: { pool: pool.address } })
          );
        }
        if (reconciliationComplete()) stopReconciliation();
        queuePoolRefresh();
      },
    });
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') queuePoolRefresh();
    }, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') queuePoolRefresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('fomeora:position-confirmed', onPositionConfirmed);
    return () => {
      stop();
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      stopReconciliation();
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('fomeora:position-confirmed', onPositionConfirmed);
    };
  }, [pool.address, router, showToast]);

  return (
    <div className="flex flex-col gap-4 px-gutter py-5">
      <PoolHeader
        pool={pool}
        priceWarning={priceWarning}
        onViewReference={() => {
          setChartSource('reference');
          document
            .getElementById('pool-price-chart')
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}
      />
      <MarketStrips stats={stats} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-rows-[auto_1fr]">
        <section id="pool-price-chart" aria-label="Chart" className="min-w-0 scroll-mt-24">
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
            source={chartSource}
            onSourceChange={setChartSource}
            referenceAvailable={referenceAvailable}
          />
          <div className="mb-2 flex items-center gap-2 text-[0.6875rem] uppercase tracking-[0.12em] text-faint">
            <span className="inline-block size-1.5 rounded-full bg-signal" />
            {candles[0]?.source === 'reference'
              ? `Reference market · ${candles.at(-1)?.sourceType === 'GECKOTERMINAL' ? `${pool.base}/${pool.quote} external pool · GeckoTerminal` : 'Chainlink'}${candles.at(-1)?.stale ? ' · delayed' : ''} · Femeora pool volume excluded`
              : 'Femeora pool trades · on-chain swaps only'}
          </div>
          <div className="glass h-[320px] rounded-[2px] sm:h-[440px]">
            <PriceChart
              pool={pool}
              candles={candles}
              intervalSeconds={INTERVAL_SECONDS[interval]}
              liquidity={showBins ? liquidity : []}
              unit={unit}
              range={panelTab === 'create' ? position.draft : null}
              onRangeChange={(bound, value) =>
                position.dispatch({
                  type: 'range',
                  ...(() => {
                    const next = {
                      ...position.draft,
                      [bound]: snapRangeBound(position.draft, bound, value, pool.binStepBps),
                    };
                    const exact = toContractBinBounds(
                      pool.baseIsTokenX,
                      pool.activeBinId,
                      next,
                      pool.binStepBps
                    );
                    return {
                      ...fromContractBinBounds(
                        pool.baseIsTokenX,
                        pool.activeBinId,
                        exact,
                        pool.binStepBps
                      ),
                      ...exact,
                    };
                  })(),
                })
              }
              callouts={own.concat(callouts)}
              showCallouts={showCallouts}
            />
          </div>
        </section>

        <aside
          aria-label="Trade panel"
          className="glass min-w-0 scroll-mt-20 self-start rounded-[2px] xl:sticky xl:top-20 xl:row-span-2"
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
