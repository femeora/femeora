'use client';

import type { ApiPoolAsset } from '@fomeora/types';
import { useEffect, useMemo, useRef, useState } from 'react';

import { TokenIcon } from '@/components/ui/TokenPair';

type Category = 'all' | ApiPoolAsset['category'];

export function PoolAssetSelect({ label, value, exclude, assets, onChange }: {
  label: string;
  value: string;
  exclude: string;
  assets: readonly ApiPoolAsset[];
  onChange: (address: string) => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const selected = assets.find(asset => asset.executable && asset.address.toLowerCase() === value.toLowerCase());
  const matches = useMemo(() => assets.filter(asset => {
    if (asset.address.toLowerCase() === exclude.toLowerCase()) return false;
    if (category !== 'all' && asset.category !== category) return false;
    const needle = query.trim().toLowerCase();
    return !needle || `${asset.symbol} ${asset.name} ${asset.address} ${asset.isin ?? ''}`.toLowerCase().includes(needle);
  }), [assets, category, exclude, query]);
  const categories: readonly { value: Category; label: string }[] = [
    { value: 'all', label: 'All' }, { value: 'stock', label: 'Stock Tokens' }, { value: 'etf', label: 'Tokenized ETFs' },
    { value: 'crypto', label: 'Crypto' }, { value: 'stablecoin', label: 'Stablecoins' },
  ];

  return <div className="relative">
    <span className="t-label text-muted">{label}</span>
    <details ref={details} className="group mt-2">
      <summary className="glass-control flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-[2px] px-3 marker:hidden">
        {selected ? <AssetLogo asset={selected} /> : <span className="size-9 rounded-full border border-line bg-panel-2" />}
        <span className="min-w-0 flex-1"><span className="block font-medium">{selected?.symbol ?? 'Select token'}</span><span className="block truncate text-xs text-muted">{selected?.name ?? 'Search by symbol, name, address, or ISIN'}</span></span>
        <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="asset-select-menu absolute z-40 mt-1 w-full min-w-[19rem] rounded-[2px] p-3 shadow-2xl">
        <input aria-label={`Search ${label}`} className="glass-control min-h-11 w-full rounded-[2px] px-3" placeholder="Search assets" value={query} onChange={event => setQuery(event.target.value)} />
        <div className="mt-3 flex flex-wrap gap-1.5">{categories.map(item => <button key={item.value} type="button" aria-pressed={category === item.value} onClick={() => setCategory(item.value)} className={`t-label min-h-9 border px-2 ${category === item.value ? 'border-signal bg-signal/10 text-fg' : 'border-line text-muted'}`}>{item.label}</button>)}</div>
        <ul className="mt-3 max-h-72 overflow-y-auto">{matches.map(asset => <li key={`${asset.chainId}:${asset.address}`}>
          <button type="button" disabled={!asset.executable} onClick={() => { onChange(asset.address); details.current?.removeAttribute('open'); }} className="flex w-full items-center gap-3 border-t border-line px-1 py-3 text-left first:border-0 enabled:hover:bg-fg/5 disabled:cursor-not-allowed disabled:opacity-45">
            <AssetLogo asset={asset} />
            <span className="min-w-0 flex-1"><span className="block font-medium">{asset.symbol} <span className="t-label ml-1 text-faint">{asset.category}</span></span><span className="block truncate text-xs text-muted">{asset.name}</span><span className="mt-1 block truncate font-mono text-[0.625rem] text-faint">{asset.address}</span>{asset.tradingStatus ? <span className="t-label mt-1 block text-[0.625rem] text-muted">Market {statusLabel(asset.tradingStatus.market)} · Extended {statusLabel(asset.tradingStatus.extended)} · Overnight {statusLabel(asset.tradingStatus.overnight)}</span> : null}</span>
            {!asset.executable ? <span className="t-label shrink-0 text-signal">Mainnet only</span> : null}
          </button>
        </li>)}{matches.length === 0 ? <li className="py-6 text-center text-sm text-muted">No matching assets.</li> : null}</ul>
      </div>
    </details>
  </div>;
}

function AssetLogo({ asset }: { asset: ApiPoolAsset }) {
  const companyLogo = asset.category === 'stock' || asset.category === 'etf'
    ? `https://logoapi.sh/ticker/${encodeURIComponent(asset.symbol)}.png`
    : null;
  const candidates = useMemo(() => [companyLogo, asset.logoUrl].filter((url): url is string => Boolean(url)), [asset.logoUrl, companyLogo]);
  const [candidate, setCandidate] = useState(0);
  useEffect(() => setCandidate(0), [asset.address, candidates]);
  const logoUrl = candidates[candidate];

  return logoUrl
    ? <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-white p-1"><img src={logoUrl} alt={`${asset.name} logo`} className="size-full object-contain" onError={() => setCandidate(current => current + 1)} /></span>
    : <TokenIcon token={asset.address} />;
}

function statusLabel(status: string | null) {
  if (!status) return 'unknown';
  return status.replace('TRADING_STATUS_', '').toLowerCase().replaceAll('_', ' ');
}
