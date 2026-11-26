'use client';

import type { CSSProperties } from 'react';

import { Check, Close } from '@/components/ui/icons';
import { statement } from '@/content/landing';
import { useScrollProgress } from '@/hooks/useScrollProgress';
import { binWeights } from '@/lib/bins';

const BINS = binWeights('curve', 18);

/**
 * Statement illustration: a screenshot of a range (flat, lossy, unverifiable)
 * hands over to a callout card (live bins, bound to chain) as the figure scrolls
 * through. Both states are drawn, scroll only moves the emphasis.
 */
export function ProofFigure() {
  const ref = useScrollProgress<HTMLElement>({ start: 0.95, end: 0.35 });

  return (
    <figure
      ref={ref}
      aria-label={`${statement.before.label} versus ${statement.after.label}`}
      className="proof-figure grid gap-4 md:grid-cols-2 md:gap-6"
    >
      <div className="proof-before relative overflow-hidden border border-fg/15 bg-fg/[0.04] p-5 md:p-6">
        <header className="t-label flex items-center justify-between text-faint">
          <span>{statement.before.label}</span>
          <span>IMG_0412.JPG</span>
        </header>
        <svg viewBox="0 0 320 150" className="mt-6 w-full" aria-hidden="true">
          <defs>
            <filter id="proof-lossy">
              <feGaussianBlur stdDeviation="1.6" />
            </filter>
            <pattern id="proof-jpeg" width="8" height="8" patternUnits="userSpaceOnUse">
              <rect width="8" height="8" fill="currentColor" opacity="0.03" />
              <rect width="4" height="4" fill="currentColor" opacity="0.05" />
            </pattern>
          </defs>
          <rect width="320" height="150" fill="url(#proof-jpeg)" />
          <g filter="url(#proof-lossy)" opacity="0.55">
            {BINS.map((weight, index) => (
              <rect
                key={index}
                x={12 + index * 16.5}
                y={140 - weight * 110}
                width="11"
                height={weight * 110}
                fill="currentColor"
                opacity="0.35"
              />
            ))}
          </g>
          <path
            d="M8 40 L312 112"
            stroke="currentColor"
            strokeOpacity="0.5"
            strokeWidth="1"
            strokeDasharray="3 5"
          />
        </svg>
        <ul className="mt-6 flex flex-col gap-2 text-[0.9375rem] text-muted">
          {statement.before.notes.map(note => (
            <li key={note} className="flex items-center gap-2.5">
              <Close aria-hidden="true" className="size-3.5 shrink-0 text-faint" strokeWidth={2} />
              {note}
            </li>
          ))}
        </ul>
      </div>

      <div className="proof-after relative overflow-hidden border border-fg/25 bg-bg p-5 shadow-[0_40px_80px_-40px_rgb(0_0_0/0.45)] md:p-6">
        <header className="t-label flex items-center justify-between">
          <span>{statement.after.label}</span>
          <span className="inline-flex items-center gap-2 text-muted">
            <span className="size-1.5 rounded-full bg-fg" />
            On chain
          </span>
        </header>
        <svg viewBox="0 0 320 150" className="mt-6 w-full" aria-hidden="true">
          <rect x="72" y="0" width="140" height="150" fill="currentColor" opacity="0.05" />
          {BINS.map((weight, index) => (
            <rect
              key={index}
              className="proof-bin"
              x={12 + index * 16.5}
              y={140 - weight * 110}
              width="11"
              height={weight * 110}
              fill="currentColor"
              opacity={index >= 4 && index <= 11 ? 0.85 : 0.18}
              style={{ '--i': index } as CSSProperties}
            />
          ))}
          <line
            className="proof-price"
            x1="0"
            x2="0"
            y1="6"
            y2="146"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        <ul className="mt-6 flex flex-col gap-2 text-[0.9375rem]">
          {statement.after.notes.map(note => (
            <li key={note} className="flex items-center gap-2.5">
              <Check aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2} />
              {note}
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
