'use client';

import { useState } from 'react';

import { Reveal } from '@/components/ui/Reveal';
import { SectionHead } from '@/components/ui/SectionHead';
import { StatusDot } from '@/components/ui/StatusDot';
import {
  chartMarkers,
  integrity,
  quickExitSignal,
  type IntegritySignal,
  type SignalId,
} from '@/content/landing';
import { cn } from '@/lib/cn';

import { MarketChart } from './MarketChart';

const BADGE_TONE: Record<IntegritySignal['tone'], string> = {
  down: 'border-down/50 text-down',
  warn: 'border-warn/50 text-warn',
  faint: 'border-line-strong text-muted',
  up: 'border-up/50 text-up',
};

const markersFor = (signal: SignalId) =>
  chartMarkers.flatMap((marker, index) => (marker.signals.includes(signal) ? [index] : []));

/**
 * Anti-shill signals (brief 13.1). Choosing a signal highlights the callouts on
 * the chart that carry it and shows the badge exactly as a feed card would.
 */
export function IntegritySection() {
  const [signal, setSignal] = useState<IntegritySignal>(quickExitSignal);
  const highlighted = markersFor(signal.id);

  return (
    <section id="integrity" aria-labelledby="integrity-title" className="section">
      <div className="wrap">
        <SectionHead
          id="integrity-title"
          cue={integrity.cue}
          label={integrity.label}
          title={integrity.title}
        />

        <Reveal className="mt-10 max-w-[44em] md:mt-14">
          <p>{integrity.body}</p>
        </Reveal>

        <div className="grid-12 mt-12 gap-y-10 md:mt-16">
          <Reveal className="col-span-12 lg:col-span-8">
            <div className="border border-line bg-panel p-3 md:p-5">
              <MarketChart
                markers={chartMarkers}
                highlight={highlighted}
                focus={highlighted[0]}
                seed={19}
                title={`Pool chart highlighting callouts flagged ${signal.name}`}
              />
            </div>
            <p
              className="t-label mt-4 flex flex-wrap items-center gap-3 text-muted"
              aria-live="polite"
            >
              <span>Card badge</span>
              <span className={cn('rounded-[2px] border px-2 py-1', BADGE_TONE[signal.tone])}>
                {signal.badge}
              </span>
            </p>
          </Reveal>

          <div className="col-span-12 lg:col-span-4">
            <p className="t-label mb-4 text-faint">{integrity.hint}</p>
            <ul className="border-t border-line">
              {integrity.signals.map(item => {
                const active = item.id === signal.id;
                return (
                  <li key={item.id} className="border-b border-line">
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSignal(item)}
                      onPointerEnter={event => event.pointerType === 'mouse' && setSignal(item)}
                      className="group flex w-full flex-col gap-1.5 py-4 text-left"
                    >
                      <span
                        className={cn(
                          'flex items-center gap-2.5 text-[1.0625rem] font-medium transition-colors duration-fast',
                          active ? 'text-fg' : 'text-muted group-hover:text-fg'
                        )}
                      >
                        <StatusDot tone={item.tone} className={cn(!active && 'opacity-40')} />
                        {item.name}
                      </span>
                      <span className="t-label pl-4 text-muted">{item.rule}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="t-label mt-6 text-faint">{integrity.footnote}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
