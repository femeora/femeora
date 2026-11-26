'use client';

import type { CSSProperties } from 'react';

import { Avatar } from '@/components/ui/Avatar';
import { ChainBadge } from '@/components/ui/ChainBadge';
import { BadgeCheck } from '@/components/ui/icons';
import { StatusDot } from '@/components/ui/StatusDot';
import { callouts } from '@/content/landing';
import { useScrollProgress } from '@/hooks/useScrollProgress';
import { binWeights } from '@/lib/bins';

const COUNT = 28;
const WEIGHTS = binWeights('curve', COUNT, 9);
const RANGE: readonly [number, number] = [3, 16];

/**
 * A callout card rendered as a physical object: it lies back in 3D and stands up
 * as the section scrolls in, with three numbered annotations tying its parts to
 * the facts beside it. Pointer tilt adds depth on fine pointers.
 */
export function CalloutSpecimen3D() {
  const ref = useScrollProgress<HTMLDivElement>({ start: 1, end: 0.35 });
  const { specimen } = callouts;

  const tilt = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      '--tx',
      String((event.clientX - rect.left) / rect.width - 0.5)
    );
    event.currentTarget.style.setProperty(
      '--ty',
      String((event.clientY - rect.top) / rect.height - 0.5)
    );
  };
  const reset = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty('--tx', '0');
    event.currentTarget.style.setProperty('--ty', '0');
  };

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="specimen-stage relative"
      onPointerMove={tilt}
      onPointerLeave={reset}
    >
      <div className="specimen-card liquid-glass relative mx-auto w-full max-w-[34rem] p-5 md:p-6">
        <header className="flex items-center gap-3">
          <Avatar seed={specimen.caller} size="md" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1.5 font-medium">
              @{specimen.caller}
              <BadgeCheck className="size-4 text-signal" strokeWidth={1.8} />
            </span>
            <span className="t-label text-faint">{specimen.pair}</span>
          </div>
          <ChainBadge className="t-label hidden text-muted sm:inline-flex" />
          <span className="specimen-pin" style={{ '--pin': 1 } as CSSProperties}>
            01
          </span>
        </header>

        <p className="mt-4 text-[1.0625rem] leading-snug">{specimen.caption}</p>

        <div className="relative mt-5 h-40 border-y border-fg/10 py-3">
          <div
            className="absolute inset-y-0 bg-fg/[0.06]"
            style={{
              left: `${(RANGE[0] / COUNT) * 100}%`,
              width: `${((RANGE[1] - RANGE[0] + 1) / COUNT) * 100}%`,
            }}
          />
          <div className="relative flex h-full items-end gap-[3px]">
            {WEIGHTS.map((weight, index) => {
              const inRange = index >= RANGE[0] && index <= RANGE[1];
              return (
                <span
                  key={index}
                  className="specimen-bin flex-1"
                  style={
                    {
                      height: `${Math.max(4, weight * 100)}%`,
                      '--i': index,
                      background: inRange ? 'rgb(var(--fg) / 0.75)' : 'rgb(var(--fg) / 0.14)',
                    } as CSSProperties
                  }
                />
              );
            })}
          </div>
          <span className="specimen-price absolute inset-y-0 w-px bg-fg shadow-[0_0_16px_2px_rgb(var(--fg)/0.4)]" />
          <span
            className="specimen-pin absolute right-2 top-2"
            style={{ '--pin': 2 } as CSSProperties}
          >
            02
          </span>
        </div>

        <dl className="t-label mt-4 grid grid-cols-3 gap-3">
          {specimen.rows.map(row => (
            <div key={row.key} className="flex flex-col gap-1">
              <dt className="text-faint">{row.key}</dt>
              <dd className="flex items-center gap-1.5 text-fg">
                {row.key === 'Status' ? <StatusDot tone="up" /> : null}
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 flex items-center justify-end gap-3">
          <span className="specimen-pin" style={{ '--pin': 3 } as CSSProperties}>
            03
          </span>
          <span className="metal t-label inline-flex min-h-10 items-center rounded-[2px] px-5">
            {specimen.tail}
          </span>
        </div>
      </div>
      <div className="specimen-shadow pointer-events-none absolute inset-x-[12%] -bottom-10 h-16 rounded-[50%] bg-[radial-gradient(closest-side,rgb(0_0_0/0.8),transparent)]" />
    </div>
  );
}
