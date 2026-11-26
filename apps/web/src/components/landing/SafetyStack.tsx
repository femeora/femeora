'use client';

import type { CSSProperties } from 'react';

import { ShieldCheck } from '@/components/ui/icons';
import { useScrollProgress } from '@/hooks/useScrollProgress';

/**
 * The safeguards as a stack of glass plates seen in isometric 3D. The plates
 * fan apart as the section scrolls, and the top one, your signature, is metal.
 */
export function SafetyStack({ layers }: { layers: readonly string[] }) {
  const ref = useScrollProgress<HTMLDivElement>({ start: 0.9, end: 0.2 });

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="safety-stack relative mx-auto aspect-square w-full max-w-[26rem]"
    >
      <div className="safety-stack__scene absolute inset-0">
        {layers.map((layer, index) => {
          const top = index === layers.length - 1;
          return (
            <div
              key={layer}
              className={top ? 'safety-plate metal' : 'safety-plate liquid-glass'}
              style={{ '--i': index } as CSSProperties}
            >
              <span className="t-label flex items-center gap-2">
                {top ? <ShieldCheck className="size-3.5" strokeWidth={1.8} /> : null}
                {String(index + 1).padStart(2, '0')} · {layer}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
