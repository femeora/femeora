'use client';

import {
  ApiCurveQuoteSchema,
  ApiCurveTradePreparationSchema,
  ApiGraduationPreparationSchema,
  ApiLaunchDetailSchema,
  ApiPoolAssetListSchema,
  type ApiCurveQuote,
  type ApiCurveTradePreparation,
  type ApiLaunchDetail,
} from '@fomeora/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatUnits } from 'viem';

import { friendlyErrorMessage } from '@/components/feedback/friendlyError';
import { Button } from '@/components/ui/Button';
import { CandlestickChart } from '@/components/ui/icons';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TokenIcon } from '@/components/ui/TokenPair';
import { TxButton } from '@/features/pool/components/TxButton';
import { useLightweightChart } from '@/features/pool/hooks/useLightweightChart';
import { sendPreparedTransaction, waitForWalletReceipt } from '@/features/wallet/adapter';
import { useWallet } from '@/features/wallet/store';
import { TransactionExecutionError } from '@/features/wallet/transactionError';
import { browserApiRequest } from '@/lib/api/client';
import { openApiEventStream } from '@/lib/api/realtime';
import { useApiResource } from '@/lib/api/useApiResource';
import { tokenColor } from '@/lib/theme';

const control = 'glass-control mt-2 min-h-11 w-full rounded-[2px] px-3 text-fg';
type CurveInterval = '5m' | '15m' | '1h' | '4h';
const curveIntervals = [
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
] as const;
const curveUnits = [
  { value: 'mcap', label: 'MCap' },
  { value: 'price', label: 'Price' },
] as const;
const curveSources = [
  { value: 'combined', label: 'Combined' },
  { value: 'projection', label: 'Curve projection' },
  { value: 'trades', label: 'Market trades' },
] as const;
const curveIntervalSeconds: Record<CurveInterval, number> = {
  '5m': 300,
  '15m': 900,
  '1h': 3_600,
  '4h': 14_400,
};

export function CurveTerminal({
  initial,
  initialQuote,
}: {
  initial: ApiLaunchDetail;
  initialQuote: { symbol: string; name: string; decimals: number; logoUrl: string | null };
}) {
  const router = useRouter();
  const launchResource = useApiResource(`/v1/launches/${initial.token}`, ApiLaunchDetailSchema, {
    fallbackData: initial,
  });
  const refreshLaunch = launchResource.mutate;
  const assets = useApiResource('/v1/pool-assets', ApiPoolAssetListSchema);
  const launch = launchResource.data ?? initial;
  const quoteAsset = assets.data?.data.find(
    asset => asset.address.toLowerCase() === launch.launchpad.quoteToken.toLowerCase()
  );
  const quoteSymbol = quoteAsset?.symbol ?? initialQuote.symbol;
  const quoteName = quoteAsset?.name ?? initialQuote.name;
  const quoteLogoUrl = quoteAsset?.logoUrl ?? initialQuote.logoUrl;
  const quoteDecimals = quoteAsset?.decimals ?? initialQuote.decimals;
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const [quote, setQuote] = useState<ApiCurveQuote | null>(null);
  const [prepared, setPrepared] = useState<ApiCurveTradePreparation | null>(null);
  const [confirmedTrade, setConfirmedTrade] = useState<{
    indexedTrades: number;
    expiresAt: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wallet = useWallet();
  const graduated = launch.status === 'graduated';
  const graduationThreshold = formatUnits(
    BigInt(launch.launchpad.graduationThresholdRaw),
    quoteDecimals
  );
  const quoteReserve = formatUnits(BigInt(launch.quoteReserveRaw), quoteDecimals);
  const tokenInventory = formatUnits(BigInt(launch.tokenInventoryRaw), 18);
  const thresholdRaw = BigInt(launch.launchpad.graduationThresholdRaw);
  const reserveRaw = BigInt(launch.quoteReserveRaw);
  const progress = thresholdRaw === 0n
    ? 0
    : Math.min(100, (Number(reserveRaw) / Number(thresholdRaw)) * 100);
  const progressLabel = formatProgress(progress);

  useEffect(
    () =>
      openApiEventStream(`/v1/launches/${launch.token}/stream`, {
        onMessage: () => void refreshLaunch(),
      }),
    [launch.token, refreshLaunch]
  );

  useEffect(() => {
    if (launch.status !== 'graduated' || !launch.graduation) return;
    router.replace(`/p/${launch.chainId}/${launch.graduation.pool}`);
  }, [launch.chainId, launch.graduation, launch.status, router]);

  useEffect(() => {
    if (!confirmedTrade) return;
    if (
      launch.status === 'graduated' ||
      launch.trades.length > confirmedTrade.indexedTrades ||
      Date.now() >= confirmedTrade.expiresAt
    ) {
      setConfirmedTrade(null);
      return;
    }
    const timer = window.setInterval(() => void refreshLaunch(), 4_000);
    return () => window.clearInterval(timer);
  }, [confirmedTrade, launch.status, launch.trades.length, refreshLaunch]);

  const reset = () => {
    setQuote(null);
    setPrepared(null);
    setError(null);
  };
  const requestQuote = async () => {
    setBusy(true);
    setError(null);
    try {
      setQuote(
        await browserApiRequest(`/v1/launches/${launch.token}/quote`, ApiCurveQuoteSchema, {
          method: 'POST',
          body: { side, amountIn: amount, slippageBps: Math.round(Number(slippage) * 100) },
        })
      );
    } catch (cause) {
      setError(friendlyErrorMessage(cause instanceof Error ? cause.message : 'CURVE_QUOTE_FAILED'));
    } finally {
      setBusy(false);
    }
  };
  const prepareTrade = async () => {
    if (!wallet.account) return void wallet.connect();
    if (wallet.config && wallet.chainId !== wallet.config.chainId)
      return void wallet.switchNetwork();
    setBusy(true);
    setError(null);
    try {
      setPrepared(
        await browserApiRequest(
          `/v1/launches/${launch.token}/trade-prepare`,
          ApiCurveTradePreparationSchema,
          {
            method: 'POST',
            body: {
              walletAddress: wallet.account,
              side,
              amountIn: amount,
              slippageBps: Math.round(Number(slippage) * 100),
            },
          }
        )
      );
    } catch (cause) {
      setError(
        friendlyErrorMessage(
          cause instanceof Error ? cause.message : 'CURVE_TRADE_PREPARATION_FAILED'
        )
      );
    } finally {
      setBusy(false);
    }
  };
  const executeTrade = async () => {
    if (!prepared || !wallet.account) throw new Error('CURVE_TRADE_PREPARATION_REQUIRED');
    if (prepared.approval) {
      const approvalHash = await sendPreparedTransaction(prepared.approval, wallet.account);
      const approvalReceipt = await waitForWalletReceipt(approvalHash);
      if (approvalReceipt.status !== 'success')
        throw new TransactionExecutionError('APPROVAL_REVERTED', approvalHash);
    }
    const hash = await sendPreparedTransaction(prepared.transaction, wallet.account);
    const receipt = await waitForWalletReceipt(hash);
    if (receipt.status !== 'success')
      throw new TransactionExecutionError('CURVE_TRADE_REVERTED', hash);
    setConfirmedTrade({ indexedTrades: launch.trades.length, expiresAt: Date.now() + 120_000 });
    setAmount('');
    reset();
    void refreshLaunch();
    return hash;
  };
  const prepareGraduation = async () => {
    if (!wallet.account) return void wallet.connect();
    const preparedGraduation = await browserApiRequest(
      `/v1/launches/${launch.token}/graduation-prepare`,
      ApiGraduationPreparationSchema,
      { method: 'POST', body: { walletAddress: wallet.account } }
    );
    const hash = await sendPreparedTransaction(preparedGraduation.transaction, wallet.account);
    const receipt = await waitForWalletReceipt(hash);
    if (receipt.status !== 'success')
      throw new TransactionExecutionError('GRADUATION_REVERTED', hash);
    void refreshLaunch();
    return hash;
  };
  const claimLaunchFees = async () => {
    if (!wallet.account) return void wallet.connect();
    if (wallet.config && wallet.chainId !== wallet.config.chainId)
      return void wallet.switchNetwork();
    const preparedClaim = await browserApiRequest(
      `/v1/launches/${launch.token}/fees-claim-prepare`,
      ApiGraduationPreparationSchema,
      { method: 'POST', body: { walletAddress: wallet.account } }
    );
    const hash = await sendPreparedTransaction(preparedClaim.transaction, wallet.account);
    const receipt = await waitForWalletReceipt(hash);
    if (receipt.status !== 'success')
      throw new TransactionExecutionError('LAUNCH_FEE_CLAIM_REVERTED', hash);
    void refreshLaunch();
    return hash;
  };
  const outputSymbol = side === 'buy' ? launch.symbol : quoteSymbol;
  const inputSymbol = side === 'buy' ? quoteSymbol : launch.symbol;
  const latestTrade = launch.trades[0];
  const latestQuoteAmount = latestTrade
    ? Number(formatUnits(BigInt(latestTrade.quoteAmountRaw), quoteDecimals))
    : 0;
  const latestTokenAmount = latestTrade
    ? Number(formatUnits(BigInt(latestTrade.tokenAmountRaw), 18))
    : 0;
  const latestPrice = latestTokenAmount > 0 ? latestQuoteAmount / latestTokenAmount : null;
  const totalSupply = Number(formatUnits(BigInt(launch.totalSupplyRaw), 18));
  const marketCap = latestPrice === null ? null : latestPrice * totalSupply;

  return (
    <div className="flex min-w-0 flex-col gap-4 px-gutter py-5">
      <header className="flex flex-col gap-4 border-b border-line pb-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex shrink-0 items-center pl-1">
            <TokenIcon
              token={launch.token}
              logoUrl={launch.imageUrl}
              name={launch.name}
              className="z-10 size-11"
            />
            <TokenIcon
              token={launch.launchpad.quoteToken}
              logoUrl={quoteLogoUrl}
              name={quoteName}
              className="-ml-3 size-11"
            />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-medium tracking-tight">
              {launch.symbol} <span className="text-muted">/ {quoteSymbol}</span>
            </h1>
            <p className="mt-0.5 truncate text-sm text-muted">
              {launch.name} · {quoteName}
            </p>
            <p className="t-label mt-0.5 flex flex-wrap items-center gap-x-2 text-muted">
              <span className="rounded-[2px] border border-line-strong px-1.5 text-fg">Curve</span>
              <span>Fee {launch.launchpad.tradeFeePips / 10_000}%</span>·
              <a className="text-signal hover:underline" href={`/lp/${launch.launchpad.slug}`}>
                {launch.launchpad.name}
              </a>
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-x-6 gap-y-3 sm:grid-cols-6">
          <HeaderMetric label="MCap" value={marketCap === null ? '—' : formatCompact(marketCap, quoteSymbol)} />
          <HeaderMetric label="Price" value={latestPrice === null ? '—' : formatPrice(latestPrice, quoteSymbol)} />
          <HeaderMetric label="Progress" value={progressLabel} />
          <HeaderMetric label="Reserve" value={`${quoteReserve} ${quoteSymbol}`} />
          <HeaderMetric label="Trades" value={String(launch.trades.length)} />
          <HeaderMetric
            label="Status"
            value={graduated ? 'Graduated' : 'Curve live'}
            {...(graduated ? { tone: 'up' as const } : {})}
          />
        </dl>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="glass flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[2px] p-3">
          <StripCell label="Quote reserve">{quoteReserve} {quoteSymbol}</StripCell>
          <StripCell label="Threshold">{graduationThreshold} {quoteSymbol}</StripCell>
          <StripCell label="Inventory">{tokenInventory} {launch.symbol}</StripCell>
        </section>
        <section className="glass flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[2px] p-3">
          <StripCell label="Creator">{launch.creator.slice(0, 8)}…{launch.creator.slice(-4)}</StripCell>
          <StripCell label="Dev holds">{(launch.devHoldingsPips / 10_000).toFixed(2)}%</StripCell>
          <StripCell label="Protection">{launch.launchpad.protectionEnabled ? 'On' : 'Off'}</StripCell>
          <StripCell label="X identity">{launch.launchpad.xRequired ? 'Required' : 'Optional'}</StripCell>
        </section>
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-rows-[auto_1fr]">
      <section className="glass min-w-0 overflow-hidden rounded-[2px] p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="t-label text-signal">Dynamic bonding curve</p>
            <h2 className="mt-2 text-2xl font-medium">{launch.symbol} graduation</h2>
            <p className="mt-2 text-muted">
              Curve trades settle on-chain. The threshold-crossing buy automatically moves the
              remaining reserves into permanently locked DAMM liquidity.
            </p>
          </div>
          <span
            className={`t-label border px-3 py-2 ${graduated ? 'border-up/40 text-up' : 'border-signal/40 text-signal'}`}
          >
            {graduated ? 'Graduated' : 'Curve active'}
          </span>
        </div>
        <div className="mt-8">
          <div
            className="graduation-progress"
            role="progressbar"
            aria-label={`${launch.symbol} graduation progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Number(progress.toFixed(2))}
          >
            <div
              className="graduation-progress__fill"
              style={{ width: `${progress > 0 ? Math.max(progress, 0.35) : 0}%` }}
            >
              <span className="graduation-progress__shimmer" aria-hidden="true" />
              {progress > 0 ? (
                <span className="graduation-progress__marker" aria-hidden="true" />
              ) : null}
            </div>
          </div>
          <div className="t-label mt-3 flex flex-wrap justify-between gap-2 text-muted">
            <span>
              <span className="text-fg">{progressLabel}</span> toward {graduationThreshold}{' '}
              {quoteSymbol} graduation
            </span>
            <span>
              {quoteReserve} / {graduationThreshold} {quoteSymbol}
            </span>
          </div>
        </div>
        <dl className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Quote reserve" value={`${quoteReserve} ${quoteSymbol}`} />
          <Metric label="Curve inventory" value={`${tokenInventory} ${launch.symbol}`} />
          <Metric label="Curve trade fee" value={`${launch.launchpad.tradeFeePips / 10_000}%`} />
          <Metric label="Trades" value={String(launch.trades.length)} />
        </dl>
        <CurvePriceChart
          trades={launch.trades}
          quoteDecimals={quoteDecimals}
          quoteSymbol={quoteSymbol}
          tokenSymbol={launch.symbol}
          totalSupply={totalSupply}
          curveTokenSupplyRaw={
            launch.launchpad.curveTokenSupplyRaw ??
            ((BigInt(launch.totalSupplyRaw) * BigInt(1_000_000 - launch.devHoldingsPips)) / 1_000_000n).toString()
          }
          graduationThresholdRaw={launch.launchpad.graduationThresholdRaw}
          currentProgress={progress}
        />
        <div className="mt-9 border-t border-line pt-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="t-label text-up">On-chain activity</p>
              <h3 className="mt-1 text-xl font-medium">Curve trades</h3>
            </div>
            <p className="t-label text-muted">Latest {launch.trades.length}</p>
          </div>
          {launch.trades.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="t-label border-b border-line text-faint">
                  <tr>
                    <th className="px-3 py-3">Side</th>
                    <th className="px-3 py-3">Trader</th>
                    <th className="px-3 py-3">Quote</th>
                    <th className="px-3 py-3">Tokens</th>
                    <th className="px-3 py-3">Progress</th>
                    <th className="px-3 py-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {launch.trades.map(trade => (
                    <tr
                      key={`${trade.transactionHash}:${trade.logIndex}`}
                      className="border-b border-line/70"
                    >
                      <td
                        className={
                          trade.side === 'buy' ? 'px-3 py-3 text-up' : 'px-3 py-3 text-down'
                        }
                      >
                        {trade.side.toUpperCase()}
                      </td>
                      <td className="px-3 py-3 font-mono">
                        {trade.trader.slice(0, 8)}…{trade.trader.slice(-4)}
                      </td>
                      <td className="px-3 py-3 font-mono">
                        {formatUnits(BigInt(trade.quoteAmountRaw), quoteDecimals)} {quoteSymbol}
                      </td>
                      <td className="px-3 py-3 font-mono">
                        {formatUnits(BigInt(trade.tokenAmountRaw), 18)} {launch.symbol}
                      </td>
                      <td className="px-3 py-3 font-mono">
                        {trade.progressPips === 0 && BigInt(trade.quoteAmountRaw) > 0n
                          ? '<0.0001%'
                          : formatProgress(trade.progressPips / 10_000)}
                      </td>
                      <td className="px-3 py-3 text-muted">
                        {new Date(trade.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 border border-line p-6 text-sm text-muted">
              No curve trades yet. The first confirmed buy or sell will appear here in realtime.
            </p>
          )}
        </div>
      </section>

      <aside className="glass min-w-0 h-fit rounded-[2px] p-4 sm:p-5">
        <p className="t-label text-muted">Trade {launch.symbol}</p>
        {graduated ? (
          <div className="mt-5">
            <p className="text-sm text-muted">
              The curve is closed. Trading and liquidity continue in the graduated DAMM pool. Anyone
              may settle accrued Launch LP fees; distribution always follows the immutable launchpad
              split.
            </p>
            {launch.graduation ? (
              <a
                className="t-label mt-4 inline-flex min-h-11 items-center text-signal underline underline-offset-4"
                href={`/p/${launch.chainId}/${launch.graduation.pool}`}
              >
                Open DAMM pool
              </a>
            ) : null}
            <div className="mt-4">
              <TxButton
                label="Distribute accrued LP fees"
                error={null}
                onExecute={claimLaunchFees}
                pendingLabel="Distributing LP fees…"
              />
            </div>
          </div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 border border-line">
              <button
                type="button"
                onClick={() => {
                  setSide('buy');
                  reset();
                }}
                className={`t-label min-h-11 ${side === 'buy' ? 'bg-fg text-bg' : 'text-muted'}`}
              >
                Buy
              </button>
              <button
                type="button"
                onClick={() => {
                  setSide('sell');
                  reset();
                }}
                className={`t-label min-h-11 ${side === 'sell' ? 'bg-fg text-bg' : 'text-muted'}`}
              >
                Sell
              </button>
            </div>
            <label className="t-label mt-5 block text-muted">
              Amount · {inputSymbol}
              <input
                className={control}
                inputMode="decimal"
                value={amount}
                onChange={event => {
                  setAmount(event.target.value);
                  reset();
                }}
              />
            </label>
            <label className="t-label mt-5 block text-muted">
              Slippage (%)
              <input
                className={control}
                inputMode="decimal"
                value={slippage}
                onChange={event => {
                  setSlippage(event.target.value);
                  reset();
                }}
              />
            </label>
            {quote ? (
              <dl className="t-label mt-5 grid gap-2 border-y border-line py-4">
                <Row label="Expected output" value={`${quote.amountOut} ${outputSymbol}`} />
                <Row label="Minimum received" value={`${quote.minimumAmountOut} ${outputSymbol}`} />
                <Row label="Curve fee · raw" value={quote.feeRaw} />
              </dl>
            ) : null}
            <div className="mt-5">
              {prepared ? (
                <TxButton
                  label={`${side === 'buy' ? 'Buy' : 'Sell'} ${launch.symbol}`}
                  error={null}
                  onExecute={executeTrade}
                  pendingLabel="Confirming curve trade…"
                />
              ) : quote ? (
                <Button variant="primary" block disabled={busy} onClick={() => void prepareTrade()}>
                  {busy ? 'Preparing transaction…' : 'Review transaction'}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  block
                  disabled={
                    busy || Number(amount) <= 0 || Number(slippage) <= 0 || Number(slippage) > 10
                  }
                  onClick={() => void requestQuote()}
                >
                  {busy ? 'Reading curve…' : 'Get on-chain quote'}
                </Button>
              )}
            </div>
            <p role="alert" className="mt-3 min-h-5 text-sm text-down">
              {error}
            </p>
          </>
        )}
        {!graduated && launch.progressPips >= 1_000_000 ? (
          <div className="mt-6 border-t border-line pt-5">
            <p className="mb-3 text-sm text-muted">
              Threshold reached. Graduation creates the DAMM pool, seeds both reserves, and
              permanently locks the Launch LP.
            </p>
            <TxButton
              label="Graduate to DAMM"
              error={null}
              onExecute={prepareGraduation}
              pendingLabel="Graduating launch…"
            />
          </div>
        ) : null}
      </aside>
      </div>
    </div>
  );
}

function CurvePriceChart({
  trades,
  quoteDecimals,
  quoteSymbol,
  tokenSymbol,
  totalSupply,
  curveTokenSupplyRaw,
  graduationThresholdRaw,
  currentProgress,
}: {
  trades: ApiLaunchDetail['trades'];
  quoteDecimals: number;
  quoteSymbol: string;
  tokenSymbol: string;
  totalSupply: number;
  curveTokenSupplyRaw: string;
  graduationThresholdRaw: string;
  currentProgress: number;
}) {
  const [interval, setInterval] = useState<CurveInterval>('1h');
  const [unit, setUnit] = useState<'mcap' | 'price'>('mcap');
  const [source, setSource] = useState<'combined' | 'projection' | 'trades'>('combined');
  const { containerRef, handles } = useLightweightChart();
  const candles = useMemo(() => {
    const seconds = curveIntervalSeconds[interval];
    const buckets = new Map<number, { time: number; open: number; high: number; low: number; close: number; volume: number }>();
    [...trades].reverse().forEach(trade => {
      const quote = Number(formatUnits(BigInt(trade.quoteAmountRaw), quoteDecimals));
      const tokens = Number(formatUnits(BigInt(trade.tokenAmountRaw), 18));
      const price = tokens > 0 ? quote / tokens : Number.NaN;
      const timestamp = Math.floor(Date.parse(trade.timestamp) / 1_000);
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp)) return;
      const time = Math.floor(timestamp / seconds) * seconds;
      const candle = buckets.get(time);
      if (candle) {
        candle.high = Math.max(candle.high, price);
        candle.low = Math.min(candle.low, price);
        candle.close = price;
        candle.volume += quote;
      } else {
        buckets.set(time, { time, open: price, high: price, low: price, close: price, volume: quote });
      }
    });
    return [...buckets.values()].sort((a, b) => a.time - b.time);
  }, [interval, quoteDecimals, trades]);

  useEffect(() => {
    if (!handles) return;
    const scale = unit === 'mcap' ? totalSupply : 1;
    handles.chart.applyOptions({
      localization: {
        priceFormatter: (value: number) =>
          unit === 'mcap' ? formatCompactValue(value) : formatCurvePrice(value),
      },
    });
    handles.candles.applyOptions({
      priceFormat: {
        type: 'custom',
        formatter: (value: number) =>
          unit === 'mcap' ? formatCompactValue(value) : formatCurvePrice(value),
        minMove: unit === 'mcap' ? 0.01 : 1e-12,
      },
    });
    handles.candles.setData(
      candles.map(candle => ({
        time: candle.time as UTCTimestamp,
        open: candle.open * scale,
        high: candle.high * scale,
        low: candle.low * scale,
        close: candle.close * scale,
      }))
    );
    handles.volume.setData(
      candles.map(candle => ({
        time: candle.time as UTCTimestamp,
        value: candle.volume,
        color: tokenColor(candle.close >= candle.open ? 'up' : 'down', 0.25),
      }))
    );
    handles.chart.timeScale().fitContent();
  }, [candles, handles, totalSupply, unit]);

  const latest = candles.at(-1);
  const projection = useMemo(() => {
    const threshold = Number(formatUnits(BigInt(graduationThresholdRaw), quoteDecimals));
    const curveSupply = Number(formatUnits(BigInt(curveTokenSupplyRaw), 18));
    const virtualQuoteSeed = threshold * 0.001;
    const invariant = curveSupply * virtualQuoteSeed;
    if (!(threshold > 0) || !(curveSupply > 0) || !(invariant > 0)) return [];
    return Array.from({ length: 101 }, (_, progressIndex) => {
      const progress = progressIndex;
      const quoteReserveAtProgress = threshold * (progress / 100);
      const virtualQuote = virtualQuoteSeed + quoteReserveAtProgress;
      const virtualToken = invariant / virtualQuote;
      const price = virtualQuote / virtualToken;
      return {
        progress,
        value: unit === 'mcap' ? price * totalSupply : price,
      };
    });
  }, [curveTokenSupplyRaw, graduationThresholdRaw, quoteDecimals, totalSupply, unit]);
  const tradeMarkers = useMemo(
    () =>
      [...trades].reverse().flatMap(trade => {
        const quote = Number(formatUnits(BigInt(trade.quoteAmountRaw), quoteDecimals));
        const tokens = Number(formatUnits(BigInt(trade.tokenAmountRaw), 18));
        const price = tokens > 0 ? quote / tokens : Number.NaN;
        if (!Number.isFinite(price) || price <= 0) return [];
        return [{
          progress: trade.progressPips / 10_000,
          value: unit === 'mcap' ? price * totalSupply : price,
          side: trade.side,
        }];
      }),
    [quoteDecimals, totalSupply, trades, unit]
  );
  return (
    <section className="mt-8 min-w-0">
      <div className="grid grid-cols-2 items-center gap-2 py-3 sm:flex sm:flex-wrap">
        <SegmentedControl
          label="Chart source"
          options={curveSources}
          value={source}
          onChange={setSource}
          className="col-span-2 w-full sm:w-auto"
        />
        <SegmentedControl
          label="Chart unit"
          options={curveUnits}
          value={unit}
          onChange={setUnit}
          className="w-full sm:w-auto"
        />
        {source === 'trades' ? (
          <SegmentedControl
            label="Chart interval"
            options={curveIntervals}
            value={interval}
            onChange={setInterval}
            className="col-span-2 w-full sm:w-auto"
          />
        ) : null}
        <p className="t-label ml-auto hidden text-[0.6875rem] text-faint lg:block">
          Drag to pan · scroll or pinch to zoom
        </p>
      </div>
      <div className="mb-2 flex items-center gap-2 text-[0.6875rem] uppercase tracking-[0.12em] text-faint">
        <span className="inline-block size-1.5 rounded-full bg-signal" />
        {source === 'trades'
          ? 'Market trades · confirmed on-chain only'
          : source === 'combined'
            ? 'On-chain curve projection · confirmed trades overlaid'
            : 'On-chain curve projection · no simulated trades'}{' '}
        · {unit === 'mcap' ? `market cap in ${quoteSymbol}` : `${quoteSymbol} per ${tokenSymbol}`}
      </div>
      <div className={`glass relative h-[320px] overflow-hidden rounded-[2px] sm:h-[440px] ${source === 'trades' ? '' : 'hidden'}`}>
        {latest ? (
          <p className="t-label pointer-events-none absolute left-2 top-1 z-10 flex flex-wrap gap-x-3 text-muted">
            <span>O <span className="text-fg">{formatChartValue(latest.open, unit, totalSupply)}</span></span>
            <span>H <span className="text-fg">{formatChartValue(latest.high, unit, totalSupply)}</span></span>
            <span>L <span className="text-fg">{formatChartValue(latest.low, unit, totalSupply)}</span></span>
            <span>C <span className="text-fg">{formatChartValue(latest.close, unit, totalSupply)}</span></span>
          </p>
        ) : null}
        <div ref={containerRef} className="h-full w-full font-mono" />
        {!latest ? (
          <div className="absolute inset-0 z-20 grid place-items-center overflow-hidden bg-bg/90 px-6 text-center">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgb(var(--fg)/0.12)_1px,transparent_1px),linear-gradient(90deg,rgb(var(--fg)/0.12)_1px,transparent_1px)] [background-size:44px_44px]" />
            <div className="relative flex max-w-md flex-col items-center">
              <span className="grid size-12 place-items-center rounded-full border border-line bg-panel-2 text-muted">
                <CandlestickChart aria-hidden="true" className="size-5" strokeWidth={1.5} />
              </span>
              <h2 className="mt-4 text-lg font-medium">No curve price history yet</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                The chart will appear automatically after the first confirmed buy or sell.
              </p>
              <p className="t-label mt-5 border border-line bg-panel-2 px-3 py-2 text-faint">
                Waiting for the first trade · no demo data
              </p>
            </div>
          </div>
        ) : null}
      </div>
      {source !== 'trades' ? (
        <CurveProjectionChart
          points={projection}
          markers={source === 'combined' ? tradeMarkers : []}
          currentProgress={currentProgress}
          unit={unit}
          quoteSymbol={quoteSymbol}
        />
      ) : null}
    </section>
  );
}

function CurveProjectionChart({
  points,
  markers,
  currentProgress,
  unit,
  quoteSymbol,
}: {
  points: readonly { progress: number; value: number }[];
  markers: readonly { progress: number; value: number; side: 'buy' | 'sell' }[];
  currentProgress: number;
  unit: 'mcap' | 'price';
  quoteSymbol: string;
}) {
  const width = 1_000;
  const height = 440;
  const inset = { left: 70, right: 24, top: 24, bottom: 48 };
  const drawableWidth = width - inset.left - inset.right;
  const drawableHeight = height - inset.top - inset.bottom;
  const positiveValues = points.map(point => point.value).filter(value => value > 0);
  const minimum = Math.min(...positiveValues);
  const maximum = Math.max(...positiveValues);
  const logMinimum = Math.log10(minimum);
  const logSpread = Math.max(Math.log10(maximum) - logMinimum, Number.EPSILON);
  const x = (progress: number) => inset.left + (Math.min(100, Math.max(0, progress)) / 100) * drawableWidth;
  const y = (value: number) => inset.top + (1 - (Math.log10(Math.max(value, minimum)) - logMinimum) / logSpread) * drawableHeight;
  const line = points.map(point => `${x(point.progress)},${y(point.value)}`).join(' ');
  const area = `${inset.left},${height - inset.bottom} ${line} ${width - inset.right},${height - inset.bottom}`;
  const valueLabel = (value: number) => unit === 'mcap' ? `${formatCompactValue(value)} ${quoteSymbol}` : `${formatCurvePrice(value)} ${quoteSymbol}`;
  return (
    <div className="glass relative h-[320px] overflow-hidden rounded-[2px] sm:h-[440px]">
      <svg viewBox={`0 0 ${width} ${height}`} className="size-full" role="img" aria-label="On-chain bonding curve projection">
        <defs>
          <linearGradient id="launch-curve-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgb(var(--signal))" stopOpacity="0.24" />
            <stop offset="1" stopColor="rgb(var(--signal))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map(progress => (
          <g key={progress}>
            <line x1={x(progress)} x2={x(progress)} y1={inset.top} y2={height - inset.bottom} stroke="rgb(var(--fg))" strokeOpacity="0.07" />
            <text x={x(progress)} y={height - 18} textAnchor="middle" fill="rgb(var(--faint))" fontSize="11" fontFamily="var(--font-mono)">{progress}%</text>
          </g>
        ))}
        {[0, 0.5, 1].map(ratio => {
          const value = 10 ** (logMinimum + logSpread * ratio);
          const ordinate = y(value);
          return (
            <g key={ratio}>
              <line x1={inset.left} x2={width - inset.right} y1={ordinate} y2={ordinate} stroke="rgb(var(--fg))" strokeOpacity="0.07" />
              <text x={inset.left - 10} y={ordinate + 4} textAnchor="end" fill="rgb(var(--faint))" fontSize="10" fontFamily="var(--font-mono)">{unit === 'mcap' ? formatCompactValue(value) : formatCurvePrice(value)}</text>
            </g>
          );
        })}
        <polygon points={area} fill="url(#launch-curve-area)" />
        <polyline points={line} fill="none" stroke="rgb(var(--signal))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <line x1={x(currentProgress)} x2={x(currentProgress)} y1={inset.top} y2={height - inset.bottom} stroke="rgb(var(--metal-hi))" strokeDasharray="5 5" strokeOpacity="0.7" />
        <circle cx={x(currentProgress)} cy={y(points[Math.min(100, Math.max(0, Math.round(currentProgress)))]?.value ?? minimum)} r="5" fill="rgb(var(--metal-hi))" />
        {markers.map((marker, index) => (
          <circle key={`${marker.progress}:${index}`} cx={x(Math.max(marker.progress, 0.35))} cy={y(marker.value)} r="5" fill={`rgb(var(--${marker.side === 'buy' ? 'up' : 'down'}))`} stroke="rgb(var(--bg))" strokeWidth="2"><title>{marker.side.toUpperCase()} · {valueLabel(marker.value)} · {formatProgress(marker.progress)}</title></circle>
        ))}
      </svg>
      <div className="t-label pointer-events-none absolute left-3 top-3 border border-line bg-bg/80 px-2 py-1 text-faint">
        Log scale · current {formatProgress(currentProgress)}
      </div>
      <div className="t-label pointer-events-none absolute bottom-3 right-3 text-faint">
        Graduation progress
      </div>
    </div>
  );
}

function formatCurvePrice(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  if (Math.abs(value) < 0.0001) return value.toExponential(4);
  return value.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function formatCompactValue(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatChartValue(value: number, unit: 'mcap' | 'price', totalSupply: number): string {
  return unit === 'mcap' ? formatCompactValue(value * totalSupply) : formatCurvePrice(value);
}

function formatProgress(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0.00%';
  if (value < 0.0001) return '<0.0001%';
  if (value < 0.01) return `${value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}%`;
  return `${value.toFixed(2)}%`;
}

function formatPrice(value: number, symbol: string): string {
  return `${formatCurvePrice(value)} ${symbol}`;
}

function formatCompact(value: number, symbol: string): string {
  return `${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)} ${symbol}`;
}

function HeaderMetric({ label, value, tone }: { label: string; value: string; tone?: 'up' }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="t-label text-faint">{label}</dt>
      <dd className={`truncate font-mono text-sm tabular-nums ${tone === 'up' ? 'text-up' : ''}`} title={value}>{value}</dd>
    </div>
  );
}

function StripCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 whitespace-nowrap">
      <span className="t-label text-faint">{label}</span>
      <span className="font-mono text-[0.8125rem] tabular-nums">{children}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line bg-panel-2 p-4">
      <dt className="t-label text-faint">{label}</dt>
      <dd className="mt-2 truncate font-mono text-sm">{value}</dd>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-faint">{label}</dt>
      <dd className="text-right text-fg">{value}</dd>
    </div>
  );
}
