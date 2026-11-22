'use client';

import { useToast } from '@/components/feedback/toast';
import { Eye, Heart, MessageCircle, Repeat2, Share2 } from '@/components/ui/icons';
import { formatCompactUsd } from '@/features/pool/model/format';
import { cn } from '@/lib/cn';

import { compactCount, type Callout } from '../model/callout';
import { useCallouts } from '../store';

const actionClass =
  'inline-flex min-h-9 items-center gap-1.5 rounded-[2px] px-1.5 transition-colors hover:text-fg aria-pressed:text-signal';

/** Share, like, repost, replies, views and the live market cap (brief 5.2 action bar). */
export function CalloutActions({ callout }: { callout: Callout }) {
  const { liked, reposted, toggleLike, toggleRepost } = useCallouts();
  const showToast = useToast(state => state.show);
  const isLiked = liked.has(callout.id);
  const isReposted = reposted.has(callout.id);
  const mcUp = callout.mcNowUsd >= callout.mcAtPostUsd;

  const share = async () => {
    const url = `${window.location.origin}/pools#callout-${callout.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied');
    } catch {
      showToast(url);
    }
  };

  return (
    <div className="t-label mt-2 flex flex-wrap items-center gap-0.5 text-muted sm:gap-1">
      <button
        type="button"
        onClick={share}
        aria-label="Copy link to callout"
        className={actionClass}
      >
        <Share2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-pressed={isLiked}
        aria-label={isLiked ? 'Unlike' : 'Like'}
        onClick={() => toggleLike(callout.id)}
        className={actionClass}
      >
        <Heart
          aria-hidden="true"
          className={cn('size-4', isLiked && 'fill-current')}
          strokeWidth={1.75}
        />
        {callout.likes + (isLiked ? 1 : 0)}
      </button>
      <button
        type="button"
        aria-pressed={isReposted}
        aria-label={isReposted ? 'Undo repost' : 'Repost'}
        onClick={() => toggleRepost(callout.id)}
        className={actionClass}
      >
        <Repeat2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
        {callout.reposts + (isReposted ? 1 : 0)}
      </button>
      <span className="inline-flex items-center gap-1.5 px-1.5">
        <MessageCircle aria-hidden="true" className="size-4" strokeWidth={1.75} />
        <span className="sr-only">Replies</span>
        {callout.replies}
      </span>
      <span className="inline-flex items-center gap-1.5 px-1.5">
        <Eye aria-hidden="true" className="size-4" strokeWidth={1.75} />
        <span className="sr-only">Views</span>
        {compactCount(callout.views)}
      </span>
      <span className={cn('ml-auto whitespace-nowrap font-mono', mcUp ? 'text-up' : 'text-down')}>
        {formatCompactUsd(callout.mcNowUsd)} <span className="text-muted">MC</span>
      </span>
    </div>
  );
}
