'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { ButtonLink } from '@/components/ui/ButtonLink';
import { RobinhoodLogo } from '@/components/ui/icons';
import { hero } from '@/content/landing';
import { useActiveBinWalk } from '@/hooks/useActiveBinWalk';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { SHAPE_LABEL } from '@/lib/bins';
import { cn } from '@/lib/cn';
import type { BinShape } from '@/types/callout';

import { BinRig } from './BinRig';
import { HeroBackdrop } from './HeroBackdrop';

const BIN_COUNT = 24;
const SHAPES = ['spot', 'curve', 'bid-ask'] as const satisfies readonly BinShape[];

function ReadoutCell({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="inline-flex max-w-full flex-col gap-1">
      <dt className="inline-flex items-center gap-2 text-faint">{label}</dt>
      <dd className="text-muted">{children}</dd>
    </div>
  );
}

export function Hero() {
  const { index } = useActiveBinWalk({ count: BIN_COUNT, intervalMs: 920 });
  const reducedMotion = usePrefersReducedMotion();
  const [shapeIndex, setShapeIndex] = useState(0);
  const shape = SHAPES[shapeIndex] ?? 'spot';

  useEffect(() => {
    if (reducedMotion) {
      setShapeIndex(0);
      return;
    }
    const id = window.setInterval(() => setShapeIndex(current => (current + 1) % SHAPES.length), 3600);
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  return (
    <section
      aria-labelledby="hero-title"
      className="relative grid min-h-[calc(100svh-56px)] items-end overflow-hidden border-b border-line"
    >
      <HeroBackdrop />
      <BinRig
        shape={shape}
        count={BIN_COUNT}
        activeIndex={index}
        className="absolute left-1/2 top-[12%] h-[38%] w-[min(86%,34rem)] -translate-x-1/2 opacity-35 md:left-auto md:right-[6%] md:top-[12%] md:h-[52%] md:w-[min(44%,40rem)] md:translate-x-0 md:opacity-100"
      />
      <div aria-hidden="true" className="t-label absolute right-[6%] top-[calc(12%+min(52vh,25rem)+1.75rem)] z-10 hidden items-center gap-1.5 text-faint md:flex">
        {SHAPES.map((item, itemIndex) => (
          <span key={item} className={cn('border border-fg/10 px-2 py-1 transition-colors duration-base', itemIndex === shapeIndex && 'border-fg/35 bg-fg/10 text-fg')}>
            {SHAPE_LABEL[item]}
          </span>
        ))}
      </div>

      <div className="wrap grid-12 relative z-10 gap-y-6 pb-8 pt-16 md:pb-10">
        <dl className="t-label col-span-12 mb-[clamp(4rem,22vh,14rem)] flex animate-fade-up flex-wrap gap-x-9 gap-y-3 [animation-delay:200ms]">
          {hero.readout.map(cell => (
            <ReadoutCell key={cell.key} label={cell.key}>
              <span className="inline-flex items-center gap-1.5 text-fg">
                {cell.chainMark ? <RobinhoodLogo className="size-3.5" /> : null}
                {cell.value}
              </span>
              {cell.detail ? <span> · {cell.detail}</span> : null}
            </ReadoutCell>
          ))}
        </dl>

        <h1 id="hero-title" className="col-span-12 text-hero font-medium md:col-span-9">
          {hero.titleLines.map((line, lineIndex) => (
            <span key={line} className="-mb-[0.06em] block overflow-hidden pb-[0.06em]">
              <span
                className="block animate-rise"
                style={{ animationDelay: `${100 + lineIndex * 90}ms` }}
              >
                {line}
              </span>
            </span>
          ))}
        </h1>

        <p className="col-span-12 max-w-[30em] animate-fade-up text-[clamp(1.0625rem,1.4vw,1.25rem)] leading-normal [animation-delay:300ms] md:col-span-6">
          {hero.dek}
        </p>

        <div className="col-span-12 flex animate-fade-up flex-wrap gap-3 self-end [animation-delay:380ms] md:col-span-5 md:col-start-8 md:justify-end">
          <ButtonLink href={hero.primaryCta.href} variant="primary">
            {hero.primaryCta.label}
          </ButtonLink>
          <ButtonLink href={hero.secondaryCta.href}>{hero.secondaryCta.label}</ButtonLink>
        </div>

        <ul className="t-label col-span-12 flex animate-fade-up flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 text-muted [animation-delay:460ms]">
          {hero.foot.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
