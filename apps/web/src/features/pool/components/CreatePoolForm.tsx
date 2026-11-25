'use client';

import { ApiPoolAssetListSchema, ApiPoolCreationPreparationSchema, ApiPoolDetailSchema, ApiPoolPairReferenceSchema, type ApiPoolCreationPreparation, type ApiPoolPairReference } from '@fomeora/types';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { friendlyErrorMessage } from '@/components/feedback/friendlyError';
import { Button } from '@/components/ui/Button';
import { sendPreparedTransaction, waitForWalletReceipt } from '@/features/wallet/adapter';
import { useWallet } from '@/features/wallet/store';
import { TransactionExecutionError } from '@/features/wallet/transactionError';
import { browserApiRequest } from '@/lib/api/client';
import { useApiResource } from '@/lib/api/useApiResource';

import { AssetLogo, PoolAssetSelect } from './PoolAssetSelect';
import { TxButton } from './TxButton';

const control = 'glass-control mt-2 min-h-11 w-full rounded-[2px] px-3 text-fg';

export function CreatePoolForm({ initialTokenA = '', initialTokenB = '' }: { initialTokenA?: string; initialTokenB?: string }) {
  const { account, config, connect, chainId, switchNetwork } = useWallet();
  const assets = useApiResource('/v1/pool-assets', ApiPoolAssetListSchema);
  const [model, setModel] = useState<'DLMM' | 'DAMM'>('DLMM');
  const [tokenA, setTokenA] = useState(initialTokenA);
  const [tokenB, setTokenB] = useState(initialTokenB);
  const [fee, setFee] = useState('0.3');
  const [binStep, setBinStep] = useState('25');
  const [initialPrice, setInitialPrice] = useState('');
  const [prepared, setPrepared] = useState<ApiPoolCreationPreparation | null>(null);
  const [createdPool, setCreatedPool] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairReference, setPairReference] = useState<ApiPoolPairReference | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [priceRiskAccepted, setPriceRiskAccepted] = useState(false);
  const indexedPool = useApiResource(createdPool ? `/v1/pools/${createdPool}` : null, ApiPoolDetailSchema, {
    refreshInterval: createdPool ? 5_000 : 0,
  });

  const update = (change: () => void) => { change(); setPrepared(null); setError(null); };
  const review = async () => {
    const deviation = pairReference?.price && Number(pairReference.price) > 0 && Number(initialPrice) > 0
      ? Math.abs(Number(initialPrice) / Number(pairReference.price) - 1) * 100
      : null;
    const riskAcceptanceRequired = pairReference?.price === null || (deviation !== null && deviation > 10);
    if (model === 'DLMM' && (referenceLoading || Number(initialPrice) <= 0 || (riskAcceptanceRequired && !priceRiskAccepted))) return;
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
  const preparedToken0 = prepared
    ? options.find(asset => asset.address.toLowerCase() === prepared.token0.address.toLowerCase()) ?? prepared.token0
    : null;
  const preparedToken1 = prepared
    ? options.find(asset => asset.address.toLowerCase() === prepared.token1.address.toLowerCase()) ?? prepared.token1
    : null;
  useEffect(() => {
    if (!tokenA || !tokenB || tokenA.toLowerCase() === tokenB.toLowerCase() || model !== 'DLMM') {
      setPairReference(null);
      setReferenceLoading(false);
      return;
    }
    let active = true;
    setReferenceLoading(true);
    setPriceRiskAccepted(false);
    void browserApiRequest(`/v1/pools/reference-price?tokenA=${encodeURIComponent(tokenA)}&tokenB=${encodeURIComponent(tokenB)}`, ApiPoolPairReferenceSchema)
      .then(result => {
        if (!active) return;
        setPairReference(result);
        if (result.price) setInitialPrice(result.price);
        setPrepared(null);
      })
      .catch(() => { if (active) setPairReference({ price: null, source: null, sourcePool: null, generatedAt: null, samePairPools: [] }); })
      .finally(() => { if (active) setReferenceLoading(false); });
    return () => { active = false; };
  }, [model, tokenA, tokenB]);
  const referenceDeviation = pairReference?.price && Number(pairReference.price) > 0 && Number(initialPrice) > 0
    ? Math.abs(Number(initialPrice) / Number(pairReference.price) - 1) * 100
    : null;
  const unknownPrice = model === 'DLMM' && Boolean(tokenA && tokenB) && !referenceLoading && pairReference?.price === null;
  const requiresRiskAcceptance = unknownPrice || (referenceDeviation !== null && referenceDeviation > 10);
  const canReview = !busy && Boolean(tokenA && tokenB) && (model !== 'DLMM' || (!referenceLoading && Number(initialPrice) > 0 && (!requiresRiskAcceptance || priceRiskAccepted)));
  const referenceLabel = pairReference?.source === 'robinhood' ? 'Robinhood market reference'
    : pairReference?.source === 'reference' ? 'External market reference'
      : pairReference?.source === 'pool' ? 'Latest indexed pool price' : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
      <section className="glass rounded-[2px] p-5 sm:p-6">
        <h2 className="text-xl font-medium">Pool configuration</h2>
        <p className="mt-2 text-sm text-muted">Choose two contracts available on the active network. Femeora verifies metadata, duplicates, and simulation before your wallet opens.</p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <PoolAssetSelect label="Token A" value={tokenA} exclude={tokenB} assets={options} onChange={value => update(() => { setTokenA(value); setInitialPrice(''); setPriceRiskAccepted(false); })} />
          <PoolAssetSelect label="Token B" value={tokenB} exclude={tokenA} assets={options} onChange={value => update(() => { setTokenB(value); setInitialPrice(''); setPriceRiskAccepted(false); })} />
          <label className="t-label text-muted">Pool model<select className={control} value={model} onChange={event => update(() => { setModel(event.target.value as 'DLMM' | 'DAMM'); setPriceRiskAccepted(false); })}><option value="DLMM">DLMM · discrete bins</option><option value="DAMM">DAMM · constant product</option></select></label>
          <label className="t-label text-muted">Pool fee (%)<input className={control} inputMode="decimal" value={fee} onChange={event => update(() => setFee(event.target.value))} /></label>
          {model === 'DLMM' ? <>
            <label className="t-label text-muted">Bin step (bps)<input className={control} inputMode="numeric" value={binStep} onChange={event => update(() => setBinStep(event.target.value))} /></label>
            <label className="t-label text-muted">Initial price · Token B per Token A<input className={control} inputMode="decimal" value={initialPrice} onChange={event => update(() => { setInitialPrice(event.target.value); setPriceRiskAccepted(false); })} />{referenceLoading ? <span className="mt-2 block text-[0.625rem] leading-relaxed text-muted">Checking available market references…</span> : null}{pairReference?.price && referenceLabel ? <span className="mt-2 block text-[0.625rem] leading-relaxed text-muted">{referenceLabel} · {pairReference.price} Token B per Token A{pairReference.generatedAt ? ` · ${new Date(pairReference.generatedAt).toLocaleString()}` : ''}</span> : null}{referenceDeviation !== null && referenceDeviation > 10 ? <span className="mt-2 block text-[0.625rem] leading-relaxed text-down">High price deviation · your price is {referenceDeviation.toFixed(2)}% away from the available market reference.</span> : null}{unknownPrice ? <span className="mt-2 block text-[0.625rem] leading-relaxed text-signal">No reliable market price is available for this pair. Verify the initial price independently before creating the pool.</span> : null}</label>
          </> : null}
        </div>
        {model === 'DLMM' && pairReference?.samePairPools.length ? <div className="mt-5 border border-signal/40 bg-signal/5 p-3 text-sm"><p className="font-medium">This token pair already has {pairReference.samePairPools.length} canonical pool{pairReference.samePairPools.length === 1 ? '' : 's'}.</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{pairReference.samePairPools.map(pool => <Link key={pool.address} className="t-label text-signal underline underline-offset-4" href={`/p/${config?.chainId ?? chainId}/${pool.address}`}>{pool.type} · {pool.feePips / 10_000}% fee{pool.type === 'DLMM' ? ` · ${pool.binStepBps} bps` : ''}</Link>)}</div></div> : null}
        {model === 'DLMM' && requiresRiskAcceptance ? <label className="mt-5 flex cursor-pointer items-start gap-3 border border-line bg-panel-2 p-3 text-sm"><input className="mt-1 size-4 accent-current" type="checkbox" checked={priceRiskAccepted} onChange={event => { setPriceRiskAccepted(event.target.checked); setPrepared(null); }} /><span>I understand that liquidity added at this initial price may be arbitraged if the price is inaccurate.</span></label> : null}
        <Button variant="primary" block className="mt-6" disabled={!canReview} onClick={() => void review()}>{busy ? 'Validating on-chain…' : account ? 'Validate & review' : 'Connect wallet'}</Button>
        <p role="alert" className="mt-3 min-h-5 text-sm text-down">{error}</p>
      </section>

      <aside className="glass h-fit rounded-[2px] p-5 sm:p-6">
        <p className="t-label text-muted">Review</p>
        {!prepared ? <p className="mt-4 text-sm text-muted">Complete the configuration to see the canonical pair, predicted address, and transaction simulation.</p> : <div className="mt-4 grid gap-4">
          <div className="flex items-center gap-3"><span className="flex items-center pl-1">{preparedToken0 ? <AssetLogo asset={preparedToken0} className="z-10" /> : null}{preparedToken1 ? <AssetLogo asset={preparedToken1} className="-ml-3" /> : null}</span><div><p className="font-medium">{prepared.token0.symbol} / {prepared.token1.symbol}</p><p className="t-label text-muted">{prepared.model} · {prepared.feePips / 10_000}% fee</p></div></div>
          <dl className="t-label grid gap-2 border-y border-line py-4 text-muted">
            {prepared.initialActiveBin !== null ? <div className="flex justify-between"><dt>Initial bin</dt><dd className="text-fg">{prepared.initialActiveBin}</dd></div> : null}
            {prepared.representedPrice ? <div className="flex justify-between"><dt>Represented price</dt><dd className="text-fg">{prepared.representedPrice}</dd></div> : null}
            <div><dt>Predicted pool</dt><dd className="mt-1 break-all font-mono text-fg">{prepared.predictedPool}</dd></div>
          </dl>
          {prepared.existingPool ? <div className="text-sm text-down"><p>This exact pool already exists. Create a different fee/model or add liquidity to the existing pool.</p><Link className="t-label mt-3 inline-flex min-h-11 items-center text-signal underline underline-offset-4" href={`/p/${prepared.chainId}/${prepared.existingPool}`}>Open existing pool</Link></div> : <p className="text-sm text-muted">Creation is permissionless. Protocol administration remains with Femeora governance. Initial liquidity is added after creation.</p>}
          {createdPool ? (
            <div className="border border-line bg-panel-2 p-4 text-sm">
              <p className="font-medium">{indexedPool.data ? 'Pool indexed and ready' : 'Pool created · indexing'}</p>
              <p className="mt-2 text-muted">{indexedPool.data ? 'The canonical pool is now available. Add initial liquidity before the first swap.' : 'The transaction is confirmed. Femeora is waiting for the safe block; no manual registration is required.'}</p>
              {indexedPool.data ? <Link className="t-label mt-4 inline-flex min-h-11 items-center text-signal underline underline-offset-4" href={`/p/${indexedPool.data.chainId}/${indexedPool.data.address}`}>Open pool and add liquidity</Link> : <p className="t-label mt-4 break-all text-faint">Predicted address · {createdPool}</p>}
            </div>
          ) : <TxButton label={`Create ${prepared.model} pool`} error={prepared.existingPool ? 'POOL_ALREADY_EXISTS' : null} {...(prepared.existingPool ? {} : { onExecute: execute })} pendingLabel="Creating pool…" />}
        </div>}
      </aside>
    </div>
  );
}
