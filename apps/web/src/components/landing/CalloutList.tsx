'use client';

import Link from 'next/link';
import { useRef, useState, type PointerEvent } from 'react';

import { CalloutSpecimen } from '@/components/callout/CalloutSpecimen';
import { RangeStatus } from '@/components/callout/RangeStatus';
import { ArrowRight } from '@/components/ui/icons';
import { Reveal } from '@/components/ui/Reveal';
import { SpanText } from '@/components/ui/SpanText';
import { cn } from '@/lib/cn';
import type { SampleCallout } from '@/types/callout';

interface CalloutListProps {
  items: readonly SampleCallout[];
  href: string;
}

/** Offset of the floating preview from the pointer, in px. */
const PREVIEW_OFFSET = { x: 48, y: -80 };

/**
 * Index-style list of sample callouts. On fine-pointer screens the hovered row
 * shows a floating card preview that follows the cursor; other rows dim.
 */
export function CalloutList({ items, href }: CalloutListProps) {
  const [active, setActive] = useState<{ index: number; viaPointer: boolean } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const followPointer = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || !previewRef.current) return;
    const x = event.clientX + PREVIEW_OFFSET.x;
    const y = event.clientY + PREVIEW_OFFSET.y;
    previewRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  // The preview only follows a mouse; keyboard focus just highlights the row.
  const previewItem = active?.viaPointer ? items[active.index] : undefined;

  return (
    <div className="relative" onPointerMove={followPointer} onPointerLeave={() => setActive(null)}>
      <ol className="border-t border-line">
        {items.map((item, index) => {
          const dimmed = active !== null && active.index !== index;
          return (
            <li key={item.title}>
              <Reveal delay={index * 40}>
                <Link
                  href={href}
                  onPointerEnter={() => setActive({ index, viaPointer: true })}
                  onFocus={() => setActive({ index, viaPointer: false })}
                  onBlur={() => setActive(null)}
                  className="group grid grid-cols-[2.5rem_1fr] items-baseline gap-x-0 gap-y-2 border-b border-line py-5 md:grid-cols-[3rem_minmax(0,1fr)_minmax(0,22rem)_6rem] md:gap-x-6"
                >
                  <span className="t-label row-span-2 text-muted md:row-span-1">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span
                    className={cn(
                      'text-h3 font-medium text-balance transition-colors duration-fast ease-brand group-hover:text-signal',
                      dimmed && 'md:text-muted'
                    )}
                  >
                    {item.title}
                  </span>
                  <span className="t-label flex flex-wrap gap-x-5 gap-y-1 text-muted">
                    {item.meta.map(meta => (
                      <span key={typeof meta === 'string' ? meta : meta.join('-')}>
                        <SpanText value={meta} />
                      </span>
                    ))}
                    <RangeStatus status={item.status} className="w-full text-fg" />
                  </span>
                  <span className="t-label hidden text-right md:block">
                    <span className="block font-mono text-up">{item.earned}</span>
                    <span className="mt-1 inline-flex items-center gap-1.5 text-muted transition-colors group-hover:text-fg">
                      View <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2} />
                    </span>
                  </span>
                </Link>
              </Reveal>
            </li>
          );
        })}
      </ol>

      <div
        ref={previewRef}
        aria-hidden="true"
        className={cn(
          'pointer-events-none fixed left-0 top-0 z-40 hidden w-[24rem] opacity-0 transition-opacity duration-base ease-brand [@media(hover:hover)_and_(min-width:900px)]:block',
          previewItem && 'opacity-100'
        )}
      >
        {previewItem ? (
          <CalloutSpecimen
            callout={previewItem}
            className="shadow-[0_30px_60px_-20px_rgb(0_0_0/0.7)]"
          />
        ) : null}
      </div>
    </div>
  );
}
