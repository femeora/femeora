'use client';

import type { CSSProperties } from 'react';

import { useScrollProgress } from '@/hooks/useScrollProgress';
import { cn } from '@/lib/cn';

/**
 * Lights a sentence word by word as it scrolls through the viewport. The full
 * text stays in the DOM, so screen readers and no-JS visitors read it normally.
 */
export function ScrollWords({ text, className }: { text: string; className?: string }) {
  const ref = useScrollProgress<HTMLSpanElement>({ start: 0.85, end: 0.3 });
  const words = text.split(' ');

  return (
    <span
      ref={ref}
      className={cn('scroll-words', className)}
      style={{ '--n': words.length } as CSSProperties}
    >
      {words.map((word, index) => (
        <span key={`${word}-${index}`} className="w" style={{ '--i': index } as CSSProperties}>
          {word}
          {index < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </span>
  );
}
