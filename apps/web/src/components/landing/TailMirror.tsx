'use client';

import type { CSSProperties } from 'react';

import { loop } from '@/content/landing';
import { useScrollProgress } from '@/hooks/useScrollProgress';
import { binWeights } from '@/lib/bins';

const COUNT = 32;
const CALLER = binWeights('bid-ask', COUNT);

/**
 * What a tail is, drawn: the caller's bins on top, and the same bins copied into
 * your range below, bar by bar, as the figure scrolls. Light beams join each
 * pair while it copies.
 */
export function TailMirror() {
  const ref = useScrollProgress<HTMLElement>({ start: 0.9, end: 0.35 });
  const { mirror } = loop;

  return (
    <figure
      ref={ref}
      aria-label={`${mirror.caller} copied to ${mirror.you}`}
      className="tail-mirror liquid-glass p-5 md:p-8"
      style={{ '--n': COUNT } as CSSProperties}
    >
      <div className="t-label mb-3 flex justify-between text-muted">
        <span>{mirror.caller}</span>
        <span className="text-faint">{COUNT} bins</span>
      </div>
      <div aria-hidden="true" className="flex h-24 items-end gap-[3px] md:h-32">
        {CALLER.map((weight, index) => (
          <span
            key={index}
            className="flex-1 bg-fg/60"
            style={{ height: `${Math.max(6, weight * 100)}%` }}
          />
        ))}
      </div>

      <div aria-hidden="true" className="flex h-16 gap-[3px] md:h-24">
        {CALLER.map((_, index) => (
          <span
            key={index}
            className="tail-beam flex-1"
            style={{ '--i': index } as CSSProperties}
          />
        ))}
      </div>

      <div aria-hidden="true" className="flex h-24 items-start gap-[3px] md:h-32">
        {CALLER.map((weight, index) => (
          <span
            key={index}
            className="tail-copy metal flex-1"
            style={{ height: `${Math.max(6, weight * 100)}%`, '--i': index } as CSSProperties}
          />
        ))}
      </div>
      <figcaption className="t-label mt-3 flex flex-wrap justify-between gap-2 text-muted">
        <span className="text-fg">{mirror.you}</span>
        <span>{mirror.note}</span>
      </figcaption>
    </figure>
  );
}
