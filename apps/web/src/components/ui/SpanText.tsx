import type { Span } from '@/types/callout';

import { ArrowRight } from './icons';

/**
 * Renders a value or a from/to pair. Pairs get an SVG arrow for sighted users and
 * the word "to" for screen readers.
 */
export function SpanText({ value }: { value: Span }) {
  if (typeof value === 'string') return <>{value}</>;
  const [from, to] = value;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {from}
      <ArrowRight aria-hidden="true" className="size-3 shrink-0" strokeWidth={2} />
      <span className="sr-only"> to </span>
      {to}
    </span>
  );
}
