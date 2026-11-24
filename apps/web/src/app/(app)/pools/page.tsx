import type { ApiPoolAsset } from '@fomeora/types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { formatUnits } from 'viem';

import { ButtonLink } from '@/components/ui/ButtonLink';
import { TokenPair } from '@/components/ui/TokenPair';
import { AssetLogo } from '@/features/pool/components/PoolAssetSelect';
import { getPoolAssets, getPools } from '@/lib/api/server';
import { tokenMeta } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pools · Fomeora',
  description: 'Browse live canonical pools and verified mainnet candidate markets on Fomeora.',
};

const compactNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

function tokenAmount(raw: string | null, decimals: number | null) {
  if (raw === null || decimals === null) return '—';
  return compactNumber.format(Number(formatUnits(BigInt(raw), decimals)));
}

function utilizationBps(reserve: string | null, cap: string | null) {
  if (!reserve || !cap || BigInt(cap) === 0n) return null;
  return Number(BigInt(reserve) * 10_000n / BigInt(cap));
}

function marketStatus(asset: ApiPoolAsset) {
  const status = asset.tradingStatus?.market;
  if (!status) return 'Mainnet asset';
  return status.replace('TRADING_STATUS_', '').replaceAll('_', ' ').toLowerCase();
}

export default async function PoolsPage() {
  let result;
  let assets: ApiPoolAsset[] = [];
  try {
    [result, assets] = await Promise.all([
      getPools(),
      getPoolAssets().then(response => response.data).catch(() => []),
    ]);
  } catch {
    return (
      <section className="mx-auto flex min-h-[55vh] max-w-3xl flex-col justify-center px-gutter py-16">
        <p className="t-label text-signal">Indexer API unavailable</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">Pools could not be loaded.</h1>
        <p className="mt-3 max-w-xl text-muted">
          The web app did not fall back to demo market data. Try again after the API service is healthy.
        </p>
        <Link href="/pools" className="t-label mt-5 min-h-11 w-fit text-signal underline underline-offset-4">Retry</Link>
      </section>
    );
  }

  const liveTokens = new Set(result.data.flatMap(pool => [pool.tokenX.toLowerCase(), pool.tokenY.toLowerCase()]));
  const quote = assets.find(asset => asset.executable && asset.symbol.toUpperCase() === 'USDG' && asset.category === 'stablecoin');
  const candidates = quote
    ? assets.filter(asset => asset.executable && (asset.category === 'stock' || asset.category === 'etf') && !liveTokens.has(asset.address.toLowerCase())).slice(0, 18)
    : [];

  return (
    <section className="px-gutter py-8">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-line pb-5">
        <div><p className="t-label text-signal">Mainnet market index</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Liquidity pools</h1>
        <p className="mt-2 max-w-2xl text-muted">Explore canonical pools already live on-chain and verified Robinhood Chain markets being prepared for permissionless launch.</p></div>
        <ButtonLink href="/pools/create" variant="primary">Create pool</ButtonLink>
      </header>

      <div className="mt-8 flex items-end justify-between gap-4 border-b border-line pb-3">
        <div><p className="t-label text-up">Live on-chain</p><h2 className="mt-1 text-xl font-medium">Canonical pools</h2></div>
        <p className="t-label text-muted">{result.data.length} indexed</p>
      </div>

      {result.data.length > 0 ? (
        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          {result.data.map(pool => (
            <li key={pool.id} className="lg:only:col-span-2">
              <Link
                href={`/p/${pool.chainId}/${pool.address}`}
                className="glass group block min-h-44 rounded-[2px] p-5 transition-colors hover:border-line-strong sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div className="min-w-0">
                  <TokenPair tokenX={pool.tokenX} tokenY={pool.tokenY} />
                    <p className="t-label mt-3 text-up">Active · canonical</p>
                  </div>
                  <div className="text-right"><p className="font-mono text-sm">{pool.type}</p><p className="t-label mt-1 text-muted">{pool.baseFeePips / 10_000}% fee</p></div>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line py-4 font-mono text-xs tabular-nums sm:grid-cols-4">
                  <div><dt className="text-faint">Active bin</dt><dd className="mt-1">{pool.activeBin ?? '—'}</dd></div>
                  <div><dt className="text-faint">Bin step</dt><dd className="mt-1">{pool.binStep ? `${pool.binStep / 100}%` : '—'}</dd></div>
                  <div><dt className="text-faint">{tokenMeta(pool.tokenX).symbol} reserve / cap</dt><dd className="mt-1">{tokenAmount(pool.reserveX, pool.tokenXDecimals)} / {tokenAmount(pool.reserveCapX, pool.tokenXDecimals)}</dd></div>
                  <div><dt className="text-faint">{tokenMeta(pool.tokenY).symbol} reserve / cap</dt><dd className="mt-1">{tokenAmount(pool.reserveY, pool.tokenYDecimals)} / {tokenAmount(pool.reserveCapY, pool.tokenYDecimals)}</dd></div>
                </dl>
                <div className="t-label mt-4 flex flex-wrap justify-between gap-2 text-faint"><span>Pool {pool.address.slice(0, 8)}…{pool.address.slice(-6)}</span><span>Cap usage {Math.max(utilizationBps(pool.reserveX, pool.reserveCapX) ?? 0, utilizationBps(pool.reserveY, pool.reserveCapY) ?? 0) / 100}% · block {pool.createdBlock}</span></div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="glass mt-4 rounded-[2px] p-8 text-center"><h3 className="text-lg font-medium">No canonical pools indexed yet</h3><p className="mx-auto mt-2 max-w-xl text-muted">Choose an available market below to launch the first pool. It will move here automatically after confirmation and indexing.</p></div>
      )}

      <div className="mt-12 flex items-end justify-between gap-4 border-b border-line pb-3">
        <div><p className="t-label text-signal">Verified asset catalog</p><h2 className="mt-1 text-xl font-medium">Candidate markets</h2><p className="mt-2 max-w-2xl text-sm text-muted">These are candidate stock/USDG markets, not live pools. Each stock token still requires a governance reserve cap before permissionless creation; TVL and volume begin only after an on-chain pool exists.</p></div>
        <p className="t-label shrink-0 text-muted">{candidates.length} candidates</p>
      </div>

      {quote && candidates.length > 0 ? <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {candidates.map(asset => <li key={`${asset.chainId}:${asset.address}`} className="glass rounded-[2px] p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3"><span className="flex pl-1"><AssetLogo asset={asset} /><AssetLogo asset={quote} /></span><div className="min-w-0"><h3 className="truncate font-medium">{asset.symbol} / {quote.symbol}</h3><p className="truncate text-sm text-muted">{asset.name}</p></div></div>
            <span className="t-label border border-signal/40 bg-signal/10 px-2 py-1 text-signal">Candidate</span>
          </div>
          <dl className="t-label mt-5 grid grid-cols-2 gap-3 border-y border-line py-4 text-muted">
            <div><dt className="text-faint">Asset type</dt><dd className="mt-1 text-fg">{asset.category === 'etf' ? 'Tokenized ETF' : 'Stock token'}</dd></div>
            <div><dt className="text-faint">Market</dt><dd className="mt-1 capitalize text-fg">{marketStatus(asset)}</dd></div>
            <div><dt className="text-faint">ISIN</dt><dd className="mt-1 truncate text-fg">{asset.isin ?? '—'}</dd></div>
            <div><dt className="text-faint">Pool status</dt><dd className="mt-1 text-signal">Reserve cap pending</dd></div>
          </dl>
          <p className="mt-4 truncate font-mono text-[0.625rem] text-faint">{asset.address}</p>
          <Link href={`/pools/create?tokenA=${encodeURIComponent(asset.address)}&tokenB=${encodeURIComponent(quote.address)}`} className="t-label mt-4 flex min-h-11 items-center justify-center border border-line-strong bg-panel-2 text-fg transition-colors hover:border-signal hover:text-signal">Prepare {asset.symbol}/{quote.symbol}</Link>
        </li>)}
      </ul> : <div className="glass mt-4 rounded-[2px] p-6 text-sm text-muted">Candidate markets are temporarily unavailable. Live canonical pools remain authoritative.</div>}
    </section>
  );
}
