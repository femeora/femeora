'use client';

import type { ElementType, PointerEvent, ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface LiquidGlassProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}

/**
 * `.liquid-glass` surface whose specular sheen follows a fine pointer. The
 * position is written to CSS variables directly, so moving never re-renders.
 */
export function LiquidGlass({ children, className, as: Tag = 'div' }: LiquidGlassProps) {
  const track = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };

  return (
    <Tag className={cn('liquid-glass', className)} onPointerMove={track}>
      {children}
    </Tag>
  );
}
