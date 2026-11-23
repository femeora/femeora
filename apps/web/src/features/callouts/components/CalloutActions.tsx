'use client';

import { ApiReplySchema, ApiSocialToggleSchema } from '@fomeora/types';
import { useState } from 'react';

import { useToast } from '@/components/feedback/toast';
import { Eye, Heart, MessageCircle, Repeat2, Share2 } from '@/components/ui/icons';
import { formatCompactUsd, formatPrice } from '@/features/pool/model/format';
import { useSession } from '@/features/session/store';
import { browserApiRequest } from '@/lib/api/client';
import { cn } from '@/lib/cn';

import { compactCount, type Callout } from '../model/callout';

const actionClass =
  'inline-flex min-h-9 items-center gap-1.5 rounded-[2px] px-1.5 transition-colors hover:text-fg aria-pressed:text-signal';

/** Share, like, repost, replies, views and the live market cap (brief 5.2 action bar). */
export function CalloutActions({ callout }: { callout: Callout }) {
  const [isLiked, setLiked] = useState(callout.viewer.liked);
  const [isReposted, setReposted] = useState(callout.viewer.reposted);
  const [replyCount, setReplyCount] = useState(callout.replies);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [pending, setPending] = useState<'like' | 'repost' | 'reply' | null>(null);
  const showToast = useToast(state => state.show);
  const user = useSession(state => state.user);
  const openSignIn = useSession(state => state.openSignIn);
  const mcUp = callout.mcNowUsd >= callout.mcAtPostUsd;
  const marketValue = callout.valuation === 'quote'
    ? formatPrice(callout.mcNowUsd)
    : formatCompactUsd(callout.mcNowUsd);

  const share = async () => {
    const url = `${window.location.origin}/pools#callout-${callout.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied');
    } catch {
      showToast(url);
    }
  };

  const toggle = async (action: 'like' | 'repost') => {
    if (!user) { openSignIn(); return; }
    if (pending) return;
    const current = action === 'like' ? isLiked : isReposted;
    const setActive = action === 'like' ? setLiked : setReposted;
    setActive(!current);
    setPending(action);
    try {
      const response = await browserApiRequest(
        `/v1/callouts/${callout.id}/${action}`,
        ApiSocialToggleSchema,
        { method: current ? 'DELETE' : 'POST' },
      );
      setActive(response.active);
    } catch (error) {
      setActive(current);
      showToast(error instanceof Error ? error.message : `${action.toUpperCase()}_FAILED`);
    } finally {
      setPending(null);
    }
  };

  const submitReply = async () => {
    if (!user) { openSignIn(); return; }
    const body = replyBody.trim();
    if (!body || pending) return;
    setPending('reply');
    try {
      await browserApiRequest(`/v1/callouts/${callout.id}/replies`, ApiReplySchema, {
        method: 'POST', body: { body, parentId: null },
      });
      setReplyCount(count => count + 1);
      setReplyBody('');
      setReplyOpen(false);
      showToast('Reply posted');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'REPLY_FAILED');
    } finally {
      setPending(null);
    }
  };

  const likes = callout.likes + Number(isLiked) - Number(callout.viewer.liked);
  const reposts = callout.reposts + Number(isReposted) - Number(callout.viewer.reposted);

  return (
    <div className="t-label mt-2 text-muted">
      <div className="flex flex-wrap items-center gap-0.5 sm:gap-1">
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
        onClick={() => void toggle('like')}
        disabled={pending === 'like'}
        className={actionClass}
      >
        <Heart
          aria-hidden="true"
          className={cn('size-4', isLiked && 'fill-current')}
          strokeWidth={1.75}
        />
        {likes}
      </button>
      <button
        type="button"
        aria-pressed={isReposted}
        aria-label={isReposted ? 'Undo repost' : 'Repost'}
        onClick={() => void toggle('repost')}
        disabled={pending === 'repost'}
        className={actionClass}
      >
        <Repeat2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
        {reposts}
      </button>
      <button type="button" onClick={() => user ? setReplyOpen(open => !open) : openSignIn()} className={actionClass} aria-expanded={replyOpen}>
        <MessageCircle aria-hidden="true" className="size-4" strokeWidth={1.75} />
        <span className="sr-only">Replies</span>
        {replyCount}
      </button>
      <span className="inline-flex items-center gap-1.5 px-1.5">
        <Eye aria-hidden="true" className="size-4" strokeWidth={1.75} />
        <span className="sr-only">Views</span>
        {compactCount(callout.views)}
      </span>
      <span className={cn('ml-auto whitespace-nowrap font-mono', mcUp ? 'text-up' : 'text-down')}>
        {marketValue}{' '}
        <span className="text-muted">{callout.valuation === 'quote' ? 'price' : 'MC'}</span>
      </span>
      </div>
      {replyOpen ? (
        <form className="mt-2 flex gap-2" onSubmit={event => { event.preventDefault(); void submitReply(); }}>
          <label className="sr-only" htmlFor={`reply-${callout.id}`}>Reply</label>
          <textarea id={`reply-${callout.id}`} value={replyBody} onChange={event => setReplyBody(event.target.value)} maxLength={280} rows={2} placeholder={`Reply to @${callout.caller.handle}`} className="min-w-0 flex-1 resize-none rounded-[2px] border border-line bg-transparent px-3 py-2 text-fg outline-none focus:border-signal" />
          <button type="submit" disabled={!replyBody.trim() || pending === 'reply'} className="self-end rounded-[2px] bg-signal px-3 py-2 text-bg disabled:opacity-50">{pending === 'reply' ? 'Posting…' : 'Reply'}</button>
        </form>
      ) : null}
    </div>
  );
}
