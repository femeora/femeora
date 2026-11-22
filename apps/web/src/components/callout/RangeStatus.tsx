import { StatusDot, type StatusTone } from '@/components/ui/StatusDot';
import { cn } from '@/lib/cn';
import type { RangeStatus as RangeStatusValue } from '@/types/callout';

const STATUS: Record<RangeStatusValue, { label: string; tone: StatusTone }> = {
  'in-range': { label: 'In range', tone: 'up' },
  'out-of-range': { label: 'Out of range', tone: 'faint' },
  closed: { label: 'Closed', tone: 'fg' },
};

/** Status dot + label (brief 5.2). Closed renders as an outline dot. */
export function RangeStatus({
  status,
  className,
}: {
  status: RangeStatusValue;
  className?: string;
}) {
  const { label, tone } = STATUS[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <StatusDot
        tone={tone}
        className={cn(status === 'closed' && 'border border-fg bg-transparent')}
      />
      {label}
    </span>
  );
}
