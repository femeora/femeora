import { ArrowRight } from '@/components/ui/icons';
import { SpanText } from '@/components/ui/SpanText';
import { SHAPE_LABEL } from '@/lib/bins';
import { cn } from '@/lib/cn';
import type { SampleCallout } from '@/types/callout';

import { MiniBins } from './MiniBins';
import { RangeStatus } from './RangeStatus';

interface CalloutSpecimenProps {
  callout: SampleCallout;
  className?: string;
}

/**
 * Read-only rendering of the callout position block (brief 5.2 card anatomy),
 * shared by the landing page and the app feed. Data is illustrative.
 */
export function CalloutSpecimen({ callout, className }: CalloutSpecimenProps) {
  return (
    <div className={cn('rounded-sm border border-line-strong bg-panel p-4 text-fg', className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">{callout.token}</p>
          <p className="t-label mt-1 whitespace-nowrap text-muted">
            {SHAPE_LABEL[callout.shape]} · {callout.pool}
          </p>
        </div>
        <MiniBins
          shape={callout.shape}
          activeIndex={callout.status === 'in-range' ? 6 : undefined}
          className="hidden sm:flex"
        />
        <dl className="grid grid-cols-2 gap-x-5 text-right">
          <dt className="t-label text-muted">Position</dt>
          <dt className="t-label text-muted">Earned</dt>
          <dd className="font-mono text-sm tabular-nums">{callout.position}</dd>
          <dd className="font-mono text-sm tabular-nums text-up">{callout.earned}</dd>
        </dl>
      </div>

      <p className="t-label mt-4 flex flex-wrap gap-x-2 gap-y-1 text-muted">
        <span>{callout.side}</span>·<SpanText value={callout.range} />·<span>{callout.bins}</span>·
        <RangeStatus status={callout.status} className="text-fg" />
      </p>

      <div className="t-label mt-3 flex items-center justify-between border-t border-line pt-3 text-muted">
        <span>
          {callout.tailers} tailers · {callout.inRange}
        </span>
        <span className="inline-flex items-center gap-1.5 text-fg">
          Tail <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2} />
        </span>
      </div>
    </div>
  );
}
