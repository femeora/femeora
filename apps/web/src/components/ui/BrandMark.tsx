import { cn } from '@/lib/cn';

/** Fomeora mark: a Bid-Ask bin histogram with the active bin lit. */
const BARS = [
  { x: 0, h: 20 },
  { x: 5, h: 13 },
  { x: 10, h: 8 },
  { x: 15, h: 13 },
  { x: 20, h: 20 },
];

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 23 20" aria-hidden="true" className={cn('h-5 w-[23px]', className)}>
      {BARS.map((bar, index) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={20 - bar.h}
          width="3"
          height={bar.h}
          className={index === 2 ? 'fill-signal' : 'fill-fg'}
        />
      ))}
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'whitespace-nowrap text-[0.8125rem] font-medium uppercase tracking-[0.14em]',
        className
      )}
    >
      Fomeora
    </span>
  );
}
