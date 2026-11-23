'use client';

import { ApiAssetReferencePriceSchema, ApiPoolAssetListSchema, ApiPoolCreationPreparationSchema, ApiPoolDetailSchema, type ApiPoolCreationPreparation } from '@fomeora/types';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { friendlyErrorMessage } from '@/components/feedback/friendlyError';
import { TokenIcon } from '@/components/ui/TokenPair';
import { sendPreparedTransaction, waitForWalletReceipt } from '@/features/wallet/adapter';
import { useWallet } from '@/features/wallet/store';
import { TransactionExecutionError } from '@/features/wallet/transactionError';
import { browserApiRequest } from '@/lib/api/client';
import { useApiResource } from '@/lib/api/useApiResource';

import { PoolAssetSelect } from './PoolAssetSelect';
import { TxButton } from './TxButton';

const control = 'glass-control mt-2 min-h-11 w-full rounded-[2px] px-3 text-fg';

export function CreatePoolForm() {
  const { account, config, connect, chainId, switchNetwork } = useWallet();
  const assets = useApiResource('/v1/pool-assets', ApiPoolAssetListSchema);
  const [model, setModel] = useState<'DLMM' | 'DAMM'>('DLMM');
  const [tokenA, setTokenA] = useState('');
  const [tokenB, setTokenB] = useState('');
  const [fee, setFee] = useState('0.3');
  const [binStep, setBinStep] = useState('25');
  const [initialPrice, setInitialPrice] = useState('1');
  const [prepared, setPrepared] = useState<ApiPoolCreationPreparation | null>(null);
  const [createdPool, setCreatedPool] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referencePrice, setReferencePrice] = useState<{ price: string; orientedPrice: string; generatedAt: string; halted: boolean } | null>(null);
  const indexedPool = useApiResource(createdPool ? `/v1/pools/${createdPool}` : null, ApiPoolDetailSchema, {
    refreshInterval: createdPool ? 5_000 : 0,
  });

  const update = (change: () => void) => { change(); setPrepared(null); setError(null); };
  const review = async () => {
    if (!account) return void connect();
    if (config && chainId !== config.chainId) return void switchNetwork();
    setBusy(true); setError(null);
    try {
      const feePips = Math.round(Number(fee) * 10_000);
      setPrepared(await browserApiRequest('/v1/pools/create-prepare', ApiPoolCreationPreparationSchema, {
        method: 'POST',
        body: { tokenA, tokenB, model, feePips, binStepBps: model === 'DLMM' ? Number(binStep) : 0, ...(model === 'DLMM' ? { initialPrice } : {}), wallet: account },
      }));
    } catch (cause) {
      setError(friendlyErrorMessage(cause instanceof Error ? cause.message : 'POOL_PREPARATION_FAILED'));
    }
    finally { setBusy(false); }
  };
  const execute = async () => {
    if (!prepared || !account) throw new Error('POOL_PREPARATION_REQUIRED');
    if (prepared.existingPool) throw new Error('POOL_ALREADY_EXISTS');
    if (Date.now() >= Date.parse(prepared.expiresAt)) throw new Error('POOL_PREPARATION_EXPIRED');
    const hash = await sendPreparedTransaction(prepared.transaction, account);
    const receipt = await waitForWalletReceipt(hash);
    if (receipt.status !== 'success') throw new TransactionExecutionError('POOL_CREATE_REVERTED', hash);
    setCreatedPool(prepared.predictedPool);
    return hash;
  };
  const options = useMemo(() => assets.data?.data ?? [], [assets.data]);
  useEffect(() => {
    const first = options.find(asset => asset.address.toLowerCase() === tokenA.toLowerCase());
    const second = options.find(asset => asset.address.toLowerCase() === tokenB.toLowerCase());
    const stock = first?.category === 'stock' || first?.category === 'etf' ? first
      : second?.category === 'stock' || second?.category === 'etf' ? second : null;
    const quote = stock === first ? second : first;
    if (!stock?.executable || quote?.category !== 'stablecoin' || model !== 'DLMM') {
      setReferencePrice(null);
      return;
    }
    let active = true;
    void browserApiRequest(`/v1/pool-assets/${stock.address}/reference-price`, ApiAssetReferencePriceSchema)
      .then(result => {
        if (!active) return;
        const oriented = stock === first ? result.priceUsd : String(1 / Number(result.priceUsd));
        setInitialPrice(oriented);
        setPrepared(null);
        setReferencePrice({ price: result.priceUsd, orientedPrice: oriented, generatedAt: result.generatedAt, halted: result.halted });
      })
      .catch(() => { if (active) setReferencePrice(null); });
    return () => { active = false; };
  }, [model, options, tokenA, tokenB]);
  const referenceDeviation = referencePrice && Number(referencePrice.orientedPrice) > 0
    ? Math.abs(Number(initialPrice) / Number(referencePrice.orientedPrice) - 1) * 100
    : null;
  const staleReference = referencePrice ? Date.now() - Date.parse(referencePrice.generatedAt) > 60_000 : false;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
      <section className="glass rounded-[2px] p-5 sm:p-6">
        <h2 className="text-xl font-medium">Pool configuration</h2>
        <p className="mt-2 text-sm text-muted">Choose two contracts available on the active network. Fomeora verifies metadata, duplicates, and simulation before your wallet opens.</p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <PoolAssetSelect label="Token A" value={tokenA} exclude={tokenB} assets={options} onChange={value => update(() => setTokenA(value))} />
          <PoolAssetSelect label="Token B" value={tokenB} exclude={tokenA} assets={options} onChange={value => update(() => setTokenB(value))} />
          <label className="t-label text-muted">Pool model<select className={control} value={model} onChange={event => update(() => setModel(event.target.value as 'DLMM' | 'DAMM'))}><option value="DLMM">DLMM · discrete bins</option><option value="DAMM">DAMM · constant product</option></select></label>
          <label className="t-label text-muted">Pool fee (%)<input className={control} inputMode="decimal" value={fee} onChange={event => update(() => setFee(event.target.value))} /></label>
          {model === 'DLMM' ? <>
            <label className="t-label text-muted">Bin step (bps)<input className={control} inputMode="numeric" value={binStep} onChange={event => update(() => setBinStep(event.target.value))} /></label>
            <label className="t-label text-muted">Initial price · Token B per Token A<input className={control} inputMode="decimal" value={initialPrice} onChange={event => update(() => setInitialPrice(event.target.value))} />{referencePrice ? <span className="mt-2 block text-[0.625rem] leading-relaxed text-muted">Robinhood reference · ${referencePrice.price} USD · {referencePrice.halted ? 'trading halt reported' : `generated ${new Date(referencePrice.generatedAt).toLocaleTimeString()}`}</span> : null}{referenceDeviation !== null && referenceDeviation > 5 ? <span className="mt-2 block text-[0.625rem] leading-relaxed text-down">Warning · initial price is {referenceDeviation.toFixed(2)}% away from the current reference.</span> : null}{staleReference ? <span className="mt-2 block text-[0.625rem] leading-relaxed text-signal">Reference price is older than 60 seconds. Refresh before signing.</span> : null}</label>
          </> : null}
        </div>
        <Button variant="primary" block className="mt-6" disabled={busy || !tokenA || !tokenB} onClick={() => void review()}>{busy ? 'Validating on-chain…' : account ? 'Validate & review' : 'Connect wallet'}</Button>
        <p role="alert" className="mt-3 min-h-5 text-sm text-down">{error}</p>
      </section>

      <aside className="glass h-fit rounded-[2px] p-5 sm:p-6">
        <p className="t-label text-muted">Review</p>
        {!prepared ? <p className="mt-4 text-sm text-muted">Complete the configuration to see the canonical pair, predicted address, and transaction simulation.</p> : <div className="mt-4 grid gap-4">
          <div className="flex items-center gap-3"><TokenIcon token={prepared.token0.address} /><TokenIcon token={prepared.token1.address} className="-ml-5" /><div><p className="font-medium">{prepared.token0.symbol} / {prepared.token1.symbol}</p><p className="t-label text-muted">{prepared.model} · {prepared.feePips / 10_000}% fee</p></div></div>
          <dl className="t-label grid gap-2 border-y border-line py-4 text-muted">
            {prepared.initialActiveBin !== null ? <div className="flex justify-between"><dt>Initial bin</dt><dd className="text-fg">{prepared.initialActiveBin}</dd></div> : null}
            {prepared.representedPrice ? <div className="flex justify-between"><dt>Represented price</dt><dd className="text-fg">{prepared.representedPrice}</dd></div> : null}
            <div><dt>Predicted pool</dt><dd className="mt-1 break-all font-mono text-fg">{prepared.predictedPool}</dd></div>
          </dl>
          {prepared.existingPool ? <div className="text-sm text-down"><p>This exact pool already exists. Create a different fee/model or add liquidity to the existing pool.</p><Link className="t-label mt-3 inline-flex min-h-11 items-center text-signal underline underline-offset-4" href={`/p/${prepared.chainId}/${prepared.existingPool}`}>Open existing pool</Link></div> : <p className="text-sm text-muted">Creation is permissionless. Protocol administration remains with Fomeora governance. Initial liquidity is added after creation.</p>}
          {createdPool ? (
            <div className="border border-line bg-panel-2 p-4 text-sm">
              <p className="font-medium">{indexedPool.data ? 'Pool indexed and ready' : 'Pool created · indexing'}</p>
              <p className="mt-2 text-muted">{indexedPool.data ? 'The canonical pool is now available. Add initial liquidity before the first swap.' : 'The transaction is confirmed. Fomeora is waiting for the safe block; no manual registration is required.'}</p>
              {indexedPool.data ? <Link className="t-label mt-4 inline-flex min-h-11 items-center text-signal underline underline-offset-4" href={`/p/${indexedPool.data.chainId}/${indexedPool.data.address}`}>Open pool and add liquidity</Link> : <p className="t-label mt-4 break-all text-faint">Predicted address · {createdPool}</p>}
            </div>
          ) : <TxButton label={`Create ${prepared.model} pool`} error={prepared.existingPool ? 'POOL_ALREADY_EXISTS' : null} {...(prepared.existingPool ? {} : { onExecute: execute })} pendingLabel="Creating pool…" />}
        </div>}
      </aside>
    </div>
  );
}
