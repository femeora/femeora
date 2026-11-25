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
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';

import { friendlyErrorMessage } from '@/components/feedback/friendlyError';
import { Button } from '@/components/ui/Button';
import { TxButton } from '@/features/pool/components/TxButton';
import { sendPreparedTransaction, waitForWalletReceipt } from '@/features/wallet/adapter';
import { useWallet } from '@/features/wallet/store';
import { TransactionExecutionError } from '@/features/wallet/transactionError';
import { browserApiRequest } from '@/lib/api/client';
import { openApiEventStream } from '@/lib/api/realtime';
import { useApiResource } from '@/lib/api/useApiResource';

const control = 'glass-control mt-2 min-h-11 w-full rounded-[2px] px-3 text-fg';

export function CurveTerminal({ initial }: { initial: ApiLaunchDetail }) {
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
  const quoteSymbol = quoteAsset?.symbol ?? 'QUOTE';
  const quoteDecimals = quoteAsset?.decimals ?? 18;
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
  const progress = Math.min(100, launch.progressPips / 10_000);
  const graduated = launch.status === 'graduated';
  const graduationThreshold = formatUnits(
    BigInt(launch.launchpad.graduationThresholdRaw),
    quoteDecimals
  );
  const quoteReserve = formatUnits(BigInt(launch.quoteReserveRaw), quoteDecimals);
  const tokenInventory = formatUnits(BigInt(launch.tokenInventoryRaw), 18);

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

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="glass rounded-[2px] p-5 sm:p-6">
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
          <div className="h-4 overflow-hidden rounded-full border border-line bg-panel-2">
            <div
              className="h-full bg-signal transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="t-label mt-3 flex justify-between text-muted">
            <span>
              {quoteReserve} / {graduationThreshold} {quoteSymbol}
            </span>
            <span>{progress.toFixed(2)}%</span>
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
                        {(trade.progressPips / 10_000).toFixed(2)}%
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

      <aside className="glass h-fit rounded-[2px] p-5">
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
  );
}

function CurvePriceChart({
  trades,
  quoteDecimals,
  quoteSymbol,
  tokenSymbol,
}: {
  trades: ApiLaunchDetail['trades'];
  quoteDecimals: number;
  quoteSymbol: string;
  tokenSymbol: string;
}) {
  const points = [...trades]
    .reverse()
    .map(trade => {
      const quote = Number(formatUnits(BigInt(trade.quoteAmountRaw), quoteDecimals));
      const tokens = Number(formatUnits(BigInt(trade.tokenAmountRaw), 18));
      return {
        price: tokens > 0 ? quote / tokens : Number.NaN,
        timestamp: Date.parse(trade.timestamp),
      };
    })
    .filter(point => Number.isFinite(point.price) && point.price > 0);
  if (points.length === 0) {
    return (
      <section className="mt-8 border border-line bg-panel-2 p-5">
        <p className="t-label text-faint">
          Curve price · {quoteSymbol} per {tokenSymbol}
        </p>
        <div className="flex h-44 items-center justify-center text-sm text-muted">
          Price history begins with the first confirmed curve trade.
        </div>
      </section>
    );
  }
  const prices = points.map(point => point.price);
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  const spread = Math.max(maximum - minimum, maximum * 0.02, Number.EPSILON);
  const width = 800;
  const height = 220;
  const insetX = 18;
  const insetY = 20;
  const drawableWidth = width - insetX * 2;
  const drawableHeight = height - insetY * 2;
  const coordinates = points.map((point, index) => ({
    x:
      insetX +
      (points.length === 1 ? drawableWidth / 2 : (index / (points.length - 1)) * drawableWidth),
    y: insetY + ((maximum + spread * 0.1 - point.price) / (spread * 1.2)) * drawableHeight,
  }));
  const line = coordinates.map(point => `${point.x},${point.y}`).join(' ');
  const area = `${insetX},${height - insetY} ${line} ${width - insetX},${height - insetY}`;
  const latest = prices.at(-1)!;
  return (
    <section className="mt-8 border border-line bg-panel-2 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="t-label text-faint">
            Curve price · {quoteSymbol} per {tokenSymbol}
          </p>
          <p className="mt-1 font-mono text-lg tabular-nums">{latest.toPrecision(7)}</p>
        </div>
        <p className="t-label text-muted">
          {points.length} confirmed trade{points.length === 1 ? '' : 's'}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-4 h-48 w-full overflow-visible"
        role="img"
        aria-label={`${tokenSymbol} bonding curve price history`}
      >
        <defs>
          <linearGradient id="curve-price-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgb(var(--signal))" stopOpacity="0.28" />
            <stop offset="1" stopColor="rgb(var(--signal))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(ratio => (
          <line
            key={ratio}
            x1={insetX}
            x2={width - insetX}
            y1={height * ratio}
            y2={height * ratio}
            stroke="rgb(var(--line))"
            strokeWidth="1"
          />
        ))}
        <polygon points={area} fill="url(#curve-price-fill)" />
        <polyline
          points={line}
          fill="none"
          stroke="rgb(var(--signal))"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
        {coordinates.length === 1 ? (
          <circle cx={coordinates[0]!.x} cy={coordinates[0]!.y} r="4" fill="rgb(var(--signal))" />
        ) : null}
      </svg>
      <div className="t-label mt-1 flex justify-between text-faint">
        <span>{new Date(points[0]!.timestamp).toLocaleString()}</span>
        <span>{new Date(points.at(-1)!.timestamp).toLocaleString()}</span>
      </div>
    </section>
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
