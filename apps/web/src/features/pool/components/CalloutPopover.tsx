import { Avatar } from '@/components/ui/Avatar';
import { BadgeCheck } from '@/components/ui/icons';
import { SpanText } from '@/components/ui/SpanText';
import { heldLabel, rangeLabel, sideLabel, type Callout } from '@/features/callouts/model/callout';
import { SHAPE_LABEL } from '@/lib/bins';

import { formatCompactUsd } from '../model/format';

interface CalloutPopoverProps {
  callout: Callout;
  /** Marker position inside the chart, in px. */
  x: number;
  y: number;
}

const WIDTH = 240;

/** Card shown when hovering a callout marker on the chart (brief 8.2). */
export function CalloutPopover({ callout, x, y }: CalloutPopoverProps) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 rounded-[2px] border border-line-strong bg-panel-2 p-3 shadow-[0_20px_40px_-20px_rgb(0_0_0/0.8)]"
      style={{
        width: WIDTH,
        left: `min(${x + 16}px, calc(100% - ${WIDTH + 8}px))`,
        top: Math.max(8, y - 24),
      }}
    >
      <div className="flex items-center gap-2">
        <Avatar initials={callout.caller.initials} size="sm" />
        <span className="text-[0.9375rem] font-medium">@{callout.caller.handle}</span>
        {callout.caller.verified ? (
          <BadgeCheck aria-label="X verified" className="size-3.5 text-signal" />
        ) : null}
        <span className="t-label ml-auto text-faint">{callout.postedAgo}</span>
      </div>
      {callout.caption ? (
        <p className="mt-2 line-clamp-2 text-[0.875rem]">{callout.caption}</p>
      ) : null}
      <dl className="t-label mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted">
        <dt>Shape</dt>
        <dd className="text-fg">
          {SHAPE_LABEL[callout.shape]} · {sideLabel(callout)}
        </dd>
        <dt>Range</dt>
        <dd className="text-fg">
          <SpanText value={rangeLabel(callout)} />
        </dd>
        <dt>Size</dt>
        <dd className="text-fg">
          {callout.showSize ? formatCompactUsd(callout.sizeUsd) : 'Hidden'}
        </dd>
        <dt>Earned</dt>
        <dd className="text-up">+{formatCompactUsd(callout.earnedUsd)}</dd>
        <dt>Tailers</dt>
        <dd className="text-fg">
          {callout.tailers} · in range {callout.inRangePct}% of {heldLabel(callout.heldHours)}
        </dd>
      </dl>
    </div>
  );
}
