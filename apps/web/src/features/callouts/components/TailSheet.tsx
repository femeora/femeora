'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { useToast } from '@/components/feedback/toast';
import { Close, TriangleAlert } from '@/components/ui/icons';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Switch } from '@/components/ui/Switch';
import { AmountField } from '@/features/pool/components/AmountField';
import { TxButton } from '@/features/pool/components/TxButton';
import { binCount, rangeSide, sideLabel as rangeSideLabel } from '@/features/pool/model/range';
import { usePortfolio } from '@/features/portfolio/store';

import { calloutSide, tailRange, type Callout, type TailMode } from '../model/callout';
import { useCallouts } from '../store';

import { CalloutCard } from './CalloutCard';

const MODES: readonly { value: TailMode; label: string }[] = [
  { value: 'same-range', label: 'Same range' },
  { value: 'same-shape-now', label: 'Same shape, from now' },
];

/** Tail sheet (brief 6.1): copy a caller's range, size it, sign your own tx. */
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
    <dialog
      ref={dialogRef}
      onClose={closeTail}
      aria-label={tailing ? `Tail @${tailing.caller.handle}` : 'Tail'}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto rounded-[2px] border border-line-strong bg-bg p-0 text-fg backdrop:bg-black/70"
    >
      {tailing ? <TailForm key={tailing.id} callout={tailing} onDone={closeTail} /> : null}
    </dialog>
  );
}

function TailForm({ callout, onDone }: { callout: Callout; onDone: () => void }) {
  const [mode, setMode] = useState<TailMode>('same-range');
  const [amount, setAmount] = useState('');
  const [postTail, setPostTail] = useState(false);
  const titleId = useId();
  const addPosition = usePortfolio(state => state.addPosition);
  const recordTail = useCallouts(state => state.recordTail);
  const showToast = useToast(state => state.show);

  const range = tailRange(callout, mode);
  const side = rangeSide(range);
  const tokens = { base: callout.pool.base, quote: callout.pool.quote };
  const sideChanged = side !== calloutSide(callout);
  const token = side === 'base' ? callout.pool.base : callout.pool.quote;
  const usdPerToken = side === 'base' ? callout.mcNowUsd / callout.pool.supply : 1;
  const amountValue = Number.parseFloat(amount) || 0;

  const confirm = () => {
    addPosition({
      pool: `${callout.pool.base} / ${callout.pool.quote}`,
      shape: callout.shape,
      minPct: range.minPct,
      maxPct: range.maxPct,
      side: rangeSideLabel(side, tokens),
      bins: binCount(range, callout.pool.binStepBps),
      depositUsd: amountValue * usdPerToken,
      callout: postTail ? { caption: `tailed @${callout.caller.handle}`, showSize: true } : null,
    });
    recordTail(callout.id);
    showToast(`Tailed @${callout.caller.handle}`);
    onDone();
  };

  return (
    <form
      onSubmit={event => event.preventDefault()}
      noValidate
      className="flex flex-col gap-4 p-5"
      aria-labelledby={titleId}
    >
      <header className="flex items-center justify-between">
        <h2 id={titleId} className="text-xl font-medium">
          Tail @{callout.caller.handle}
        </h2>
        <button
          type="button"
          onClick={onDone}
          aria-label="Close"
          className="grid size-11 place-items-center text-muted hover:text-fg"
        >
          <Close aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </button>
      </header>

      <CalloutCard callout={callout} preview />

      <SegmentedControl
        label="Tail mode"
        size="md"
        className="w-full"
        options={MODES}
        value={mode}
        onChange={setMode}
      />

      {sideChanged ? (
        <p
          role="status"
          className="flex gap-2 rounded-[2px] border border-warn/50 p-3 text-[0.9375rem] text-warn"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          Price moved since this call. This range is now{' '}
          {rangeSideLabel(side, tokens).toLowerCase()}.
        </p>
      ) : null}

      <div>
        <AmountField
          token={`Your size · ${token}`}
          value={amount}
          usdPerToken={usdPerToken}
          enabled
          onChange={setAmount}
        />
        <p className="t-label mt-2 text-muted">
          Bins and shape are copied from the callout. You only choose the size.
        </p>
      </div>

      <Switch
        label={`Post "tailed @${callout.caller.handle}" in the feed`}
        checked={postTail}
        onChange={setPostTail}
      />

      <TxButton
        label="Tail this range"
        error={amountValue > 0 ? null : 'Enter your size'}
        onConfirmed={confirm}
      />
      <p className="t-label text-faint">
        Tailing copies a range, not a result. LP positions can lose value. You sign your own
        transaction.
      </p>
    </form>
  );
}
