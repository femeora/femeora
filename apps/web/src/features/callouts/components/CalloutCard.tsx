'use client';

import { MiniBins } from '@/components/callout/MiniBins';
import { Chip } from '@/components/ui/Chip';
import { ArrowRight, TriangleAlert } from '@/components/ui/icons';
import { SpanText } from '@/components/ui/SpanText';
import { StatusDot } from '@/components/ui/StatusDot';
import { formatCompactUsd } from '@/features/pool/model/format';
import { SHAPE_LABEL } from '@/lib/bins';
import { cn } from '@/lib/cn';

import {
  calloutBins,
  calloutStatus,
  heldLabel,
  rangeLabel,
  sideLabel,
  type Callout,
} from '../model/callout';
import { useCallouts } from '../store';

const STATUS = {
  'in-range': { label: 'In range', tone: 'up' },
  'out-of-range': { label: 'Out of range', tone: 'neutral' },
  closed: { label: 'Closed', tone: 'neutral' },
} as const;

interface CalloutCardProps {
  callout: Callout;
  /** Read-only rendering (composer preview, Tail sheet): no Tail button. */
  preview?: boolean;
}

/**
 * The proof-backed position block of a callout (brief 5.2): token, shape, bins,
 * position and earned, attribute chips, anti-shill badges and the Tail action.
 */
export function CalloutCard({ callout, preview = false }: CalloutCardProps) {
  const openTail = useCallouts(state => state.openTail);
  const tailers = useCallouts(state => callout.tailers + (state.extraTailers[callout.id] ?? 0));
  const statusKey = calloutStatus(callout);
  const status = STATUS[statusKey];
  const earned = callout.showSize
    ? `+${formatCompactUsd(callout.earnedUsd)}`
    : `+${((callout.earnedUsd / callout.sizeUsd) * 100).toFixed(2)}%`;

  return (
    <div className="rounded-[2px] border border-line-strong bg-panel">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 p-3.5">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-signal font-mono text-xs text-on-signal"
        >
          {callout.pool.base.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="font-medium">{callout.pool.base}</p>
          <p className="t-label whitespace-nowrap text-muted">
            {SHAPE_LABEL[callout.shape]} · {callout.pool.type}
          </p>
        </div>
        {callout.pool.type === 'DLMM' ? (
          <MiniBins shape={callout.shape} count={14} className="ml-1 hidden h-6 sm:flex" />
        ) : null}
        <dl className="grid w-full grid-cols-2 gap-x-5 sm:ml-auto sm:w-auto sm:text-right">
          <dt className="t-label text-muted">Position</dt>
          <dt className="t-label text-muted">Earned</dt>
          <dd className="font-mono text-sm tabular-nums">
            {callout.showSize ? formatCompactUsd(callout.closed ? 0 : callout.sizeUsd) : 'Hidden'}
          </dd>
          <dd className="font-mono text-sm tabular-nums text-up">{earned}</dd>
        </dl>
      </div>

      <div className="flex flex-wrap gap-1.5 px-3.5 pb-3">
        <Chip tone="signal">{sideLabel(callout)}</Chip>
        <Chip>
          <SpanText value={rangeLabel(callout)} />
        </Chip>
        {callout.pool.type === 'DLMM' ? <Chip>{calloutBins(callout)} bins</Chip> : null}
        <Chip tone={status.tone}>
          <StatusDot
            tone={status.tone === 'up' ? 'up' : 'faint'}
            className={cn(callout.closed && 'border border-faint bg-transparent')}
          />
          {status.label}
        </Chip>
        {callout.quickExitMinutes !== null ? (
          <Chip tone="down">
            <TriangleAlert aria-hidden="true" className="size-3" strokeWidth={2} />
            Exited {callout.quickExitMinutes}m after call
          </Chip>
        ) : null}
        {callout.oppositeSide ? <Chip tone="warn">Also selling above</Chip> : null}
      </div>

      <div className="t-label flex items-center justify-between gap-3 border-t border-line px-3.5 py-2 text-muted">
        <span>
          {tailers} tailers · in range {callout.inRangePct}% of {heldLabel(callout.heldHours)}
        </span>
        {preview ? null : (
          <button
            type="button"
            onClick={() => openTail(callout)}
            aria-label={`Tail @${callout.caller.handle}'s range`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-[2px] bg-fg px-3 text-bg transition-colors hover:bg-signal hover:text-on-signal"
          >
            Tail <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}
