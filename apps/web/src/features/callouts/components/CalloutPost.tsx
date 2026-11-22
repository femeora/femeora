'use client';

import { useState } from 'react';

import { Avatar } from '@/components/ui/Avatar';
import { BadgeCheck } from '@/components/ui/icons';

import type { Callout } from '../model/callout';

import { CalloutActions } from './CalloutActions';
import { CalloutCard } from './CalloutCard';
import { CaptionText } from './CaptionText';

/** Captions longer than this are clamped to two lines with "Show more" (brief 5.2). */
const CLAMP_FROM = 110;
/** Update rows shown before "Show more updates" (brief 5.3). */
const VISIBLE_UPDATES = 2;

interface CalloutPostProps {
  callout: Callout;
  /** Marks the signed-in user's own callouts. */
  own?: boolean;
}

/** A callout in a list: caller, caption, position card, update thread, actions. */
export function CalloutPost({ callout, own = false }: CalloutPostProps) {
  const [captionOpen, setCaptionOpen] = useState(false);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const { caller } = callout;
  const longCaption = (callout.caption?.length ?? 0) > CLAMP_FROM;
  const updates = updatesOpen ? callout.updates : callout.updates.slice(0, VISIBLE_UPDATES);
  const hiddenUpdates = callout.updates.length - updates.length;

  return (
    <article
      id={`callout-${callout.id}`}
      className="grid scroll-mt-28 grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-line px-gutter py-5"
    >
      <Avatar initials={caller.initials} size="lg" self={own} />
      <div className="min-w-0">
        <header className="flex flex-wrap items-center gap-x-1.5 text-[0.9375rem]">
          <span className="font-medium">{caller.name}</span>
          {caller.verified ? (
            <BadgeCheck aria-label="X verified" className="size-4 text-signal" />
          ) : null}
          <span className="t-label text-faint">
            @{caller.handle} · {callout.postedAgo}
            {callout.edited ? ' · edited' : ''}
          </span>
        </header>

        {callout.caption ? (
          <>
            <p
              className={`mt-1 whitespace-pre-wrap ${longCaption && !captionOpen ? 'line-clamp-2' : ''}`}
            >
              <CaptionText text={callout.caption} />
            </p>
            {longCaption ? (
              <button
                type="button"
                onClick={() => setCaptionOpen(open => !open)}
                className="t-label min-h-9 text-muted hover:text-fg"
              >
                {captionOpen ? 'Show less' : 'Show more'}
              </button>
            ) : null}
          </>
        ) : null}

        <div className="mt-3">
          <CalloutCard callout={callout} />
        </div>

        {callout.updates.length > 0 ? (
          <ol className="mt-2 border-l border-line-strong pl-3">
            {updates.map(update => (
              <li key={`${update.text}-${update.ago}`} className="py-1 text-[0.9375rem]">
                {update.text} <span className="t-label text-faint">· {update.ago}</span>
              </li>
            ))}
            {hiddenUpdates > 0 ? (
              <li>
                <button
                  type="button"
                  onClick={() => setUpdatesOpen(true)}
                  className="t-label min-h-9 text-muted hover:text-fg"
                >
                  Show {hiddenUpdates} more {hiddenUpdates === 1 ? 'update' : 'updates'}
                </button>
              </li>
            ) : null}
          </ol>
        ) : null}

        <CalloutActions callout={callout} />
      </div>
    </article>
  );
}
