'use client';

import { ApiReplySchema, ApiSocialToggleSchema, ApiViewCountSchema } from '@fomeora/types';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { useToast } from '@/components/feedback/toast';
import { Avatar } from '@/components/ui/Avatar';
import { BadgeCheck, Eye, Heart, MessageCircle, MessageSquareQuote, Repeat2, Share2, Trash2 } from '@/components/ui/icons';
import { formatCompactUsd, formatPrice } from '@/features/pool/model/format';
import { useSession } from '@/features/session/store';
import { browserApiRequest } from '@/lib/api/client';
import { cn } from '@/lib/cn';

import { compactCount, type Callout, type CalloutComment } from '../model/callout';

const actionClass =
  'inline-flex min-h-9 items-center gap-1.5 rounded-[2px] px-1.5 transition-colors hover:text-fg aria-pressed:text-signal';

/** Share, like, repost, replies, views and the live market cap (brief 5.2 action bar). */
export function CalloutActions({ callout, own, onChanged, onCalloutDeleted }: { callout: Callout; own: boolean; onChanged?: () => void; onCalloutDeleted: () => void }) {
  const [isLiked, setLiked] = useState(callout.viewer.liked);
  const [isReposted, setReposted] = useState(callout.viewer.reposted);
  const [replyCount, setReplyCount] = useState(callout.replies);
  const [quoteCount, setQuoteCount] = useState(callout.quotes);
  const [viewCount, setViewCount] = useState(callout.views);
  const [comments, setComments] = useState<readonly CalloutComment[]>(callout.comments);
  const [composer, setComposer] = useState<'reply' | 'quote' | null>(null);
  const [replyParent, setReplyParent] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<'like' | 'repost' | 'reply' | 'quote' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<'callout' | string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const showToast = useToast(state => state.show);
  const user = useSession(state => state.user);
  const openSignIn = useSession(state => state.openSignIn);
  const mcUp = callout.mcNowUsd >= callout.mcAtPostUsd;
  const marketValue = callout.valuation === 'quote'
    ? formatPrice(callout.mcNowUsd)
    : formatCompactUsd(callout.mcNowUsd);

  useEffect(() => {
    const node = actionsRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    let recorded = false;
    const observer = new IntersectionObserver(entries => {
      if (recorded || !entries.some(entry => entry.isIntersecting)) return;
      recorded = true;
      observer.disconnect();
      void browserApiRequest(`/v1/callouts/${callout.id}/view`, ApiViewCountSchema, { method: 'POST' })
        .then(response => setViewCount(response.views))
        .catch(() => undefined);
    }, { threshold: 0.5 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [callout.id]);

  const share = async () => {
    const url = `${window.location.origin}/p/${callout.pool.chainId}/${callout.pool.address}#callout-${callout.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `@${callout.caller.handle} on Fomeora`, text: callout.caption ?? 'View this Fomeora callout', url });
        showToast('Callout shared.');
      } else {
        await navigator.clipboard.writeText(url);
        showToast('Callout link copied.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      showToast('The share menu was unavailable. Copy the callout URL from your browser.', { title: 'Could not share', tone: 'error', userFacing: true });
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
      showToast(response.active ? `${action === 'like' ? 'Callout liked' : 'Callout reposted'}.` : `${action === 'like' ? 'Like' : 'Repost'} removed.`);
    } catch (error) {
      setActive(current);
      showToast(error instanceof Error ? error.message : `${action.toUpperCase()}_FAILED`, { title: `${action === 'like' ? 'Like' : 'Repost'} failed`, tone: 'error' });
    } finally {
      setPending(null);
    }
  };

  const openComposer = (kind: 'reply' | 'quote', parentId: string | null = null) => {
    if (!user) { openSignIn(); return; }
    setComposer(kind);
    setReplyParent(parentId);
    setMessage('');
  };

  const submitMessage = async () => {
    if (!user) { openSignIn(); return; }
    const body = message.trim();
    if (!body || pending || !composer) return;
    const kind = composer;
    setPending(kind);
    try {
      const response = await browserApiRequest(`/v1/callouts/${callout.id}/${kind === 'quote' ? 'quotes' : 'replies'}`, ApiReplySchema, {
        method: 'POST', body: { body, parentId: kind === 'reply' ? replyParent : null },
      });
      const name = response.user.name ?? response.user.handle;
      setComments(current => [...current, {
        id: response.id,
        parentId: response.parentId,
        kind: response.kind,
        body: response.body,
        createdAt: response.createdAt,
        caller: {
          id: response.user.id,
          handle: response.user.handle,
          name,
          initials: name.slice(0, 2).toUpperCase(),
          avatarUrl: response.user.avatarUrl,
          verified: response.user.xVerified,
        },
      }]);
      if (kind === 'reply') setReplyCount(count => count + 1);
      else setQuoteCount(count => count + 1);
      setMessage('');
      setComposer(null);
      setReplyParent(null);
      showToast(kind === 'quote' ? 'Quote callout posted.' : 'Reply posted.');
      onChanged?.();
    } catch (error) {
      showToast(error instanceof Error ? error.message : `${kind.toUpperCase()}_FAILED`, { title: `${kind === 'quote' ? 'Quote' : 'Reply'} failed`, tone: 'error' });
    } finally {
      setPending(null);
    }
  };

  const likes = callout.likes + Number(isLiked) - Number(callout.viewer.liked);
  const reposts = callout.reposts + Number(isReposted) - Number(callout.viewer.reposted);

  const deleteSelected = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      if (deleteTarget === 'callout') {
        await browserApiRequest(`/v1/callouts/${callout.id}`, z.undefined(), { method: 'DELETE' });
        showToast('Your callout was removed.', { title: 'Callout deleted' });
        onCalloutDeleted();
        return;
      }
      const removed = comments.find(comment => comment.id === deleteTarget);
      await browserApiRequest(`/v1/callouts/${callout.id}/replies/${deleteTarget}`, z.undefined(), { method: 'DELETE' });
      setComments(current => current
        .filter(comment => comment.id !== deleteTarget)
        .map(comment => comment.parentId === deleteTarget ? { ...comment, parentId: null } : comment));
      if (removed?.kind === 'quote') setQuoteCount(count => Math.max(0, count - 1));
      else setReplyCount(count => Math.max(0, count - 1));
      setDeleteTarget(null);
      showToast(removed?.kind === 'quote' ? 'Your quote was removed.' : 'Your comment was removed.', { title: 'Post deleted' });
      onChanged?.();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'DELETE_FAILED', { title: 'Could not delete', tone: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div ref={actionsRef} className="t-label mt-2 text-muted">
      <div className="flex flex-wrap items-center gap-0.5 sm:gap-1">
      <button
        type="button"
        onClick={share}
        aria-label="Copy link to callout"
        className={actionClass}
      >
        <Share2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </button>
      <button type="button" onClick={() => openComposer('quote')} className={actionClass} aria-expanded={composer === 'quote'} aria-label="Quote callout">
        <MessageSquareQuote aria-hidden="true" className="size-4" strokeWidth={1.75} />
        {quoteCount}
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
      <button type="button" onClick={() => composer === 'reply' ? setComposer(null) : openComposer('reply')} className={actionClass} aria-expanded={composer === 'reply'}>
        <MessageCircle aria-hidden="true" className="size-4" strokeWidth={1.75} />
        <span className="sr-only">Replies</span>
        {replyCount}
      </button>
      <span className="inline-flex items-center gap-1.5 px-1.5">
        <Eye aria-hidden="true" className="size-4" strokeWidth={1.75} />
        <span className="sr-only">Views</span>
        {compactCount(viewCount)}
      </span>
      {own ? <button type="button" onClick={() => setDeleteTarget('callout')} className={actionClass} aria-label="Delete callout">
        <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </button> : null}
      <span className={cn('ml-auto whitespace-nowrap font-mono', mcUp ? 'text-up' : 'text-down')}>
        {marketValue}{' '}
        <span className="text-muted">{callout.valuation === 'quote' ? 'price' : 'MC'}</span>
      </span>
      </div>
      {deleteTarget ? <div role="alertdialog" aria-label="Confirm deletion" className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-down/50 bg-down/5 p-3">
        <p className="font-sans text-[0.875rem] text-fg">{deleteTarget === 'callout' ? 'Delete this callout and remove it from the feed?' : 'Delete this comment or quote?'}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting} className="min-h-9 px-3 text-muted">Cancel</button>
          <button type="button" onClick={() => void deleteSelected()} disabled={deleting} className="min-h-9 border border-down px-3 text-down disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div> : null}
      {composer ? (
        <form className="mt-3 flex gap-2" onSubmit={event => { event.preventDefault(); void submitMessage(); }}>
          <label className="sr-only" htmlFor={`message-${callout.id}`}>{composer === 'quote' ? 'Quote callout' : 'Reply'}</label>
          <textarea id={`message-${callout.id}`} value={message} onChange={event => setMessage(event.target.value)} maxLength={280} rows={2} placeholder={composer === 'quote' ? 'Add your take to this callout' : `Reply to @${replyParent ? comments.find(comment => comment.id === replyParent)?.caller.handle ?? callout.caller.handle : callout.caller.handle}`} className="min-w-0 flex-1 resize-none rounded-[2px] border border-line bg-transparent px-3 py-2 text-fg outline-none focus:border-signal" />
          <button type="submit" disabled={!message.trim() || pending === composer} className="self-end rounded-[2px] bg-signal px-3 py-2 text-bg disabled:opacity-50">{pending === composer ? 'Posting…' : composer === 'quote' ? 'Quote' : 'Reply'}</button>
        </form>
      ) : null}
      {comments.length > 0 ? <ol className="mt-3 grid gap-2 border-t border-line pt-3">
        {comments.filter(comment => comment.kind === 'reply').map(comment => <li key={comment.id} className={cn('flex gap-2 rounded-[2px] bg-panel-2/60 p-3', comment.parentId && 'ml-6')}>
          <Avatar seed={comment.caller.handle} src={comment.caller.avatarUrl} alt={`${comment.caller.name} avatar`} size="xs" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-sans text-[0.8125rem] font-medium text-fg">{comment.caller.name}</span>
              {comment.caller.verified ? <BadgeCheck aria-label="X verified" className="size-3.5 text-signal" /> : null}
              <span className="text-faint">@{comment.caller.handle}</span>
              {user?.id === comment.caller.id ? <button type="button" onClick={() => setDeleteTarget(comment.id)} className="ml-auto grid size-8 place-items-center text-muted hover:text-down" aria-label={`Delete ${comment.kind}`}><Trash2 aria-hidden="true" className="size-3.5" /></button> : null}
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words font-sans text-[0.875rem] text-fg">{comment.body}</p>
            {comment.kind === 'reply' ? <button type="button" onClick={() => openComposer('reply', comment.id)} className="mt-1 min-h-8 text-signal">Reply</button> : null}
          </div>
        </li>)}
      </ol> : null}
    </div>
  );
}
