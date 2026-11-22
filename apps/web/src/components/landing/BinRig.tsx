'use client';

import { useRef, type CSSProperties, type PointerEvent } from 'react';

import { binWeights } from '@/lib/bins';
import { cn } from '@/lib/cn';
import type { BinShape } from '@/types/callout';

interface BinRigProps {
  shape: BinShape;
  count: number;
  activeIndex: number;
  className?: string;
}

const MAX_TILT_DEG = 6;

/**
 * Hero illustration: a liquidity-bin histogram whose active bin lights up as the
 * simulated price walks. Tilts slightly toward the pointer on fine-pointer devices.
 */
export function BinRig({ shape, count, activeIndex, className }: BinRigProps) {
  const rigRef = useRef<HTMLDivElement>(null);
  const weights = binWeights(shape, count);

  const tilt = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || !rigRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    rigRef.current.style.transform = `rotateY(${x * MAX_TILT_DEG * 2}deg) rotateX(${-y * MAX_TILT_DEG * 2}deg)`;
  };

  const resetTilt = () => {
    if (rigRef.current) rigRef.current.style.transform = '';
  };

  const priceOffset = { '--active': activeIndex } as CSSProperties;

  return (
    <div
      aria-hidden="true"
      className={cn('[perspective:1400px]', className)}
      onPointerMove={tilt}
      onPointerLeave={resetTilt}
    >
      <div
        ref={rigRef}
        className="relative h-full w-full transition-transform duration-slow ease-out-expo [transform-style:preserve-3d]"
      >
        <div
          className="relative grid h-full items-end gap-x-1.5"
          style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
        >
          {weights.map((weight, index) => {
            const distance = Math.abs(index - activeIndex);
            return (
              <span
                key={index}
                className={cn(
                  'block border border-fg/10 transition-[background-color,box-shadow] duration-base ease-brand',
                  distance === 0 &&
                    'border-fg/60 bg-fg/80 shadow-[0_0_48px_6px_rgb(var(--fg)/0.25)]',
                  distance === 1 && 'bg-fg/20',
                  distance > 1 && (index < activeIndex ? 'bg-fg/[0.09]' : 'bg-fg/[0.045]')
                )}
                style={{ height: `${Math.round(weight * 100)}%` }}
              />
            );
          })}
        </div>

        <span
          className="absolute -bottom-6 top-0 w-px bg-signal transition-[left] duration-base ease-brand"
          style={{ ...priceOffset, left: `calc((var(--active) + 0.5) / ${count} * 100%)` }}
        />
      </div>
    </div>
  );
}
