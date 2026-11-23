'use client';

import { ApiPositionActionPreparationSchema, type ApiIndexedPosition, type ApiPositionActionPreparation } from '@fomeora/types';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { TxButton } from '@/features/pool/components/TxButton';
import { useWallet } from '@/features/wallet/store';
import { browserApiRequest } from '@/lib/api/client';

import { executePositionAction } from '../executePositionAction';

type ActionKind = 'increase' | 'decrease' | 'close';

export function PositionActionPanel({ position, onConfirmed }: { position: ApiIndexedPosition; onConfirmed: () => Promise<unknown> }) {
  const [kind, setKind] = useState<ActionKind>('increase');
  const [amountX, setAmountX] = useState('');
  const [amountY, setAmountY] = useState('');
  const [bps, setBps] = useState(5_000);
  const [preparation, setPreparation] = useState<ApiPositionActionPreparation | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [stage, setStage] = useState('Preparing transaction…');
  const [hash, setHash] = useState<string | null>(null);
  const { account, config } = useWallet();

  const path = `/v1/positions/${position.id}/${kind}-prepare`;
  const body = () => ({
    walletAddress: account,
    slippageBps: 50,
    ...(kind === 'increase' ? { amountX, amountY } : {}),
    ...(kind === 'decrease' ? { bps } : {}),
  });
  const valid = kind !== 'increase' || (Number(amountX) > 0 || Number(amountY) > 0);
  const prepare = () => browserApiRequest(path, ApiPositionActionPreparationSchema, { method: 'POST', body: body() });
  const review = async () => {
    if (!account || !valid) return;
    setReviewing(true); setReviewError(null); setHash(null);
    try { setPreparation(await prepare()); }
    catch (cause) { setPreparation(null); setReviewError(cause instanceof Error ? cause.message : 'POSITION_REVIEW_FAILED'); }
    finally { setReviewing(false); }
  };
  const execute = async () => {
    if (!account || !preparation) throw new Error('POSITION_PREPARATION_REQUIRED');
    const transactionHash = await executePositionAction({ account, preparation, refreshPreparation: prepare, onStage: setStage });
    setHash(transactionHash); setPreparation(null); await onConfirmed(); return transactionHash;
  };
  const choose = (next: ActionKind) => { setKind(next); setPreparation(null); setReviewError(null); setHash(null); };

  return (
    <div className="grid gap-3 border-t border-line py-4">
      <div className="flex flex-wrap gap-2">{(['increase', 'decrease', 'close'] as const).map(actionKind => (
        <Button key={actionKind} variant={kind === actionKind ? 'primary' : 'ghost'} onClick={() => choose(actionKind)} className="min-h-9 capitalize">{actionKind}</Button>
      ))}</div>
      {kind === 'increase' ? <div className="grid gap-2 sm:grid-cols-2">
        <label className="t-label text-muted">Token X amount<input className="glass-control mt-1 w-full rounded-[2px] p-2 font-mono text-fg" inputMode="decimal" value={amountX} onChange={event => { setAmountX(event.target.value); setPreparation(null); }} /></label>
        <label className="t-label text-muted">Token Y amount<input className="glass-control mt-1 w-full rounded-[2px] p-2 font-mono text-fg" inputMode="decimal" value={amountY} onChange={event => { setAmountY(event.target.value); setPreparation(null); }} /></label>
      </div> : null}
      {kind === 'decrease' ? <label className="t-label text-muted">Remove {bps / 100}%<input type="range" min={100} max={9_900} step={100} value={bps} onChange={event => { setBps(Number(event.target.value)); setPreparation(null); }} className="block h-11 w-full accent-[rgb(var(--signal))]" /></label> : null}
      {kind === 'close' ? <p className="text-sm text-down">Closing removes all liquidity and burns the position NFT. Review the minimum outputs before signing.</p> : null}
      {preparation ? <dl className="t-label grid gap-1 text-muted"><div className="flex justify-between"><dt>Expected token X</dt><dd className="text-fg">{preparation.quote.amountXRaw} raw</dd></div><div className="flex justify-between"><dt>Expected token Y</dt><dd className="text-fg">{preparation.quote.amountYRaw} raw</dd></div><div className="flex justify-between"><dt>Safe block</dt><dd className="text-fg">{preparation.quote.blockNumber}</dd></div></dl> : null}
      <Button onClick={() => void review()} disabled={!account || !valid || reviewing}>{reviewing ? 'Reading safe-block state…' : `Review ${kind}`}</Button>
      <p role="alert" className="t-label min-h-4 text-down">{reviewError}</p>
      <TxButton label={`${kind[0]!.toUpperCase()}${kind.slice(1)} position`} error={preparation ? null : `Review ${kind} first`} onExecute={execute} pendingLabel={stage} />
      {hash && config ? <a className="t-label break-all text-signal hover:underline" href={`${config.explorerUrl.replace(/\/$/, '')}/tx/${hash}`} target="_blank" rel="noreferrer">View confirmed transaction {hash}</a> : null}
    </div>
  );
}
