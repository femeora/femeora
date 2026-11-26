'use client';

import type { ApiLaunchpadReputation } from '@fomeora/types';
import { useState } from 'react';

import { Close, ShieldCheck } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

const metric = (value: string) =>
  `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

export function ReputationBadge({
  reputation,
  quoteSymbol = 'quote',
  interactive = false,
}: {
  reputation: ApiLaunchpadReputation | null;
  quoteSymbol?: string;
  interactive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!reputation)
    return (
      <span className="t-label border border-line px-2 py-1 text-faint">Reputation pending</span>
    );
  const label =
    reputation.tier === 'Unrated'
      ? 'New'
      : `${reputation.tier} · ${Number(reputation.score).toFixed(0)}`;
  const badge = (
    <span
      className={cn(
        't-label inline-flex items-center gap-1.5 border px-2 py-1',
        reputation.tier === 'Verified' ? 'border-up/50 text-up' : 'border-signal/40 text-signal'
      )}
    >
      <ShieldCheck aria-hidden="true" className="size-3.5" />
      {label}
    </span>
  );
  if (!interactive) return badge;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="min-h-11"
      >
        {badge}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-bg/80 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={event => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="reputation-title"
            className="glass max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-[2px] p-5 sm:p-6"
          >
            <header className="flex items-start justify-between gap-4">
              <div>
                <p className="t-label text-signal">
                  Historical on-chain reputation · {reputation.window}
                </p>
                <h2 id="reputation-title" className="mt-2 text-2xl font-medium">
                  {reputation.tier === 'Unrated'
                    ? 'New launchpad'
                    : `${reputation.tier} · ${Number(reputation.score).toFixed(2)}/100`}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close reputation details"
                className="grid size-11 shrink-0 place-items-center text-muted hover:text-fg"
              >
                <Close aria-hidden="true" className="size-5" />
              </button>
            </header>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Derived only from canonical launches, trades, graduations, pool activity and revenue
              events. Historical metrics do not predict future results.
            </p>
            <dl className="mt-6 grid gap-px bg-line sm:grid-cols-2">
              <Metric
                label="Launches"
                description="Canonical token launches in this scoring window."
                value={String(reputation.launches)}
              />
              <Metric
                label="Eligible launches"
                description="Launches old enough to be included in graduation-rate calculations."
                value={String(reputation.eligibleLaunches)}
              />
              <Metric
                label="Graduation rate"
                description="Graduated launches divided by launches older than 72 hours."
                value={metric(reputation.graduationRate)}
              />
              <Metric
                label="7-day survival rate"
                description="Graduated tokens that still have liquidity and at least one pool trade after seven days."
                value={metric(reputation.survivalRate)}
              />
              <Metric
                label="Median graduation"
                description="Median elapsed time from token launch to confirmed graduation."
                value={
                  reputation.medianTimeToGraduateSeconds
                    ? duration(Number(reputation.medianTimeToGraduateSeconds))
                    : 'Not available'
                }
              />
              <Metric
                label="Developer exit rate"
                description="Launches where the creator sold more than half of their early buy within 24 hours."
                value={metric(reputation.devExitRate)}
                warning
              />
              <Metric
                label="Early top-5 share"
                description="Share of supply bought during the protected early window by the five largest wallets."
                value={metric(reputation.sniperShare)}
                warning
              />
              <Metric
                label="Protection"
                description="Historical score for protected launch, X requirement, caps and zero launchpad admins."
                value={metric(reputation.protectionScore)}
              />
              <Metric
                label={`Volume · ${quoteSymbol}`}
                description="Canonical curve and post-graduation pool volume in the quote asset."
                value={Number(reputation.volumeQuote).toLocaleString(undefined, {
                  maximumFractionDigits: 6,
                })}
              />
              <Metric
                label={`Launchpad revenue · ${quoteSymbol}`}
                description="Canonical launchpad revenue events in the quote asset."
                value={Number(reputation.revenueQuote).toLocaleString(undefined, {
                  maximumFractionDigits: 6,
                })}
              />
            </dl>
            {reputation.tier === 'Unrated' ? (
              <p className="mt-4 border border-line p-3 text-sm text-muted">
                A numeric public tier appears after five canonical launches. The breakdown remains
                visible while the launchpad is new.
              </p>
            ) : null}
            <p className="t-label mt-4 text-faint">
              Computed {new Date(reputation.computedAt).toLocaleString()}
            </p>
          </section>
        </div>
      ) : null}
    </>
  );
}

function Metric({
  label,
  description,
  value,
  warning = false,
}: {
  label: string;
  description: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="bg-bg p-4">
      <dt className="t-label text-faint">
        <span
          title={description}
          className="cursor-help underline decoration-dotted underline-offset-4"
        >
          {label}
        </span>
      </dt>
      <dd className={cn('mt-2 font-mono', warning && 'text-down')}>{value}</dd>
    </div>
  );
}

function duration(seconds: number) {
  if (seconds < 3_600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${(seconds / 3_600).toFixed(1)}h`;
  return `${(seconds / 86_400).toFixed(1)}d`;
}
