'use client';

import { ApiTailIntentSchema, ApiTailPreparationSchema, ApiTailQuoteSchema, type ApiTailQuote } from '@fomeora/types';
import { useEffect, useId, useRef, useState } from 'react';

import { useToast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/Button';
import { Close, TriangleAlert } from '@/components/ui/icons';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { AmountField } from '@/features/pool/components/AmountField';
import { TxButton } from '@/features/pool/components/TxButton';
import { useWallet } from '@/features/wallet/store';
import { browserApiRequest } from '@/lib/api/client';

import type { Callout, TailMode } from '../model/callout';
import { executePreparedTail } from '../model/executeTail';
import { useCallouts } from '../store';

import { CalloutCard } from './CalloutCard';

const MODES: readonly { value: TailMode; label: string }[] = [
  { value: 'same-range', label: 'Same range' },
  { value: 'same-shape-now', label: 'Same shape, from now' },
];
const apiMode = (mode: TailMode) => mode === 'same-range' ? 'same_range' as const : 'same_shape_now' as const;

/** Tail sheet: quote server state, create a bound intent, then let the user sign every transaction. */
export function TailSheet() {
  const { tailing, closeTail } = useCallouts();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (tailing && !dialog.open) dialog.showModal();
    if (!tailing && dialog.open) dialog.close();
  }, [tailing]);
  return (
    <dialog ref={dialogRef} onClose={closeTail} aria-label={tailing ? `Tail @${tailing.caller.handle}` : 'Tail'} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto glass-raised rounded-[2px] p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm">
      {tailing ? <TailForm key={tailing.id} callout={tailing} onDone={closeTail} /> : null}
    </dialog>
  );
}

function TailForm({ callout, onDone }: { callout: Callout; onDone: () => void }) {
  const [mode, setMode] = useState<TailMode>('same-range');
  const [amountX, setAmountX] = useState('');
  const [amountY, setAmountY] = useState('');
  const [quote, setQuote] = useState<ApiTailQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [stage, setStage] = useState('Preparing tail intent…');
  const [hash, setHash] = useState<string | null>(null);
  const titleId = useId();
  const { account, config } = useWallet();
  const showToast = useToast(state => state.show);
  const invalidate = () => { setQuote(null); setQuoteError(null); setHash(null); };
  const requestQuote = async () => {
    setQuoting(true); setQuoteError(null); setHash(null);
    try {
      setQuote(await browserApiRequest(`/v1/callouts/${callout.id}/tail-quote`, ApiTailQuoteSchema, { method: 'POST', body: { mode: apiMode(mode) } }));
    } catch (cause) { setQuote(null); setQuoteError(cause instanceof Error ? cause.message : 'TAIL_QUOTE_FAILED'); }
    finally { setQuoting(false); }
  };
  const amountError = !quote ? 'Review tail range first'
    : quote.requiresTokenX && !(Number(amountX) > 0) ? `Enter ${callout.pool.base} amount`
      : quote.requiresTokenY && !(Number(amountY) > 0) ? `Enter ${callout.pool.quote} amount` : null;
  const execute = async () => {
    if (!account || !quote) throw new Error('WALLET_OR_TAIL_QUOTE_REQUIRED');
    setStage('Creating tail intent…');
    const intent = await browserApiRequest(`/v1/callouts/${callout.id}/tail-intent`, ApiTailIntentSchema, {
      method: 'POST', body: { mode: apiMode(mode), walletAddress: account },
    });
    const requestBody = () => ({
      mode: apiMode(mode), walletAddress: account, intentId: intent.intentId,
      amountX: quote.requiresTokenX ? amountX : '0', amountY: quote.requiresTokenY ? amountY : '0', slippageBps: 50,
    });
    const prepare = () => browserApiRequest(`/v1/callouts/${callout.id}/tail-prepare`, ApiTailPreparationSchema, { method: 'POST', body: requestBody() });
    setStage('Preparing exact approvals…');
    const transactionHash = await executePreparedTail({ account, preparation: await prepare(), refreshPreparation: prepare, onStage: setStage });
    setHash(transactionHash); setQuote(null); showToast('Tailed position confirmed; indexer will attach it to the source callout');
  };

  return (
    <form onSubmit={event => event.preventDefault()} noValidate className="flex flex-col gap-4 p-5" aria-labelledby={titleId}>
      <header className="flex items-center justify-between"><h2 id={titleId} className="text-xl font-medium">Tail @{callout.caller.handle}</h2><button type="button" onClick={onDone} aria-label="Close" className="grid size-11 place-items-center text-muted hover:text-fg"><Close aria-hidden="true" className="size-5" strokeWidth={1.75} /></button></header>
      <CalloutCard callout={callout} preview />
      <SegmentedControl label="Tail mode" size="md" className="w-full" options={MODES} value={mode} onChange={value => { setMode(value); invalidate(); }} />
      {quote?.warnings.map(warning => <p key={warning} role="status" className="flex gap-2 rounded-[2px] border border-down/50 p-3 text-[0.9375rem] text-down"><TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2} />{warning.replaceAll('_', ' ').toLowerCase()}</p>)}
      {quote ? <div className="glass rounded-[2px] p-3 text-sm"><p>{quote.poolType === 'DLMM' ? `Bins ${quote.lowerBin} to ${quote.upperBin}` : 'Full-range DAMM'}</p><p className="t-label mt-1 text-muted">Shape {quote.shape} · active bin {quote.expectedActiveBin ?? 'n/a'}</p></div> : null}
      {quote?.requiresTokenX ? <AmountField token={`Token X · ${callout.pool.base}`} value={amountX} usdPerToken={1} enabled onChange={value => { setAmountX(value); setHash(null); }} /> : null}
      {quote?.requiresTokenY ? <AmountField token={`Token Y · ${callout.pool.quote}`} value={amountY} usdPerToken={1} enabled onChange={value => { setAmountY(value); setHash(null); }} /> : null}
      <Button block onClick={() => void requestQuote()} disabled={quoting}>{quoting ? 'Reading canonical range…' : 'Review tail range'}</Button>
      <p role="alert" className="t-label min-h-4 text-down">{quoteError}</p>
      <TxButton label="Tail this range" error={amountError} onExecute={execute} pendingLabel={stage} />
      {hash && config ? <a href={`${config.explorerUrl.replace(/\/$/, '')}/tx/${hash}`} target="_blank" rel="noreferrer" className="t-label break-all text-signal hover:underline">View confirmed transaction {hash}</a> : null}
      <p className="t-label text-faint">Tailing copies a range, not a result. LP positions can lose value. You sign your own approvals and position transaction.</p>
    </form>
  );
}
