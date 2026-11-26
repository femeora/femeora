'use client';

import {
  ApiLaunchpadReplySchema,
  ApiSocialToggleSchema,
  ApiViewCountSchema,
  type ApiLaunchpad,
  type ApiLaunchpadReply,
  type ApiPoolAsset,
} from '@fomeora/types';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { useToast } from '@/components/feedback/toast';
import { Avatar } from '@/components/ui/Avatar';
import {
  ArrowRight,
  BadgeCheck,
  Eye,
  Heart,
  MessageCircle,
  MessageSquareQuote,
  Repeat2,
  Share2,
  Trash2,
} from '@/components/ui/icons';
import { useSession } from '@/features/session/store';
import { browserApiRequest } from '@/lib/api/client';
import { cn } from '@/lib/cn';

import { ReputationBadge } from './ReputationBadge';

function elapsedLabel(timestamp: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

const actionClass =
  'inline-flex min-h-9 items-center gap-1.5 rounded-[2px] px-1.5 text-muted transition-colors hover:text-fg aria-pressed:text-signal disabled:opacity-50';

function LaunchpadAttachment({
  launchpad,
  quoteAsset,
  compact = false,
}: {
  launchpad: ApiLaunchpad;
  quoteAsset?: ApiPoolAsset | undefined;
  compact?: boolean;
}) {
  const tradeFee = (launchpad.tradeFeePips / 10_000).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
  return (
    <Link
      href={`/lp/${encodeURIComponent(launchpad.slug)}`}
      className="glass group block overflow-hidden rounded-[2px] transition-colors hover:border-line-strong"
    >
      <div
        className={cn(
          'relative overflow-hidden border-b border-line bg-panel-2',
          compact ? 'aspect-[4/1] min-h-20' : 'aspect-[3/1] min-h-28'
        )}
      >
        {launchpad.bannerUrl ? (
          <img
            src={launchpad.bannerUrl}
            alt={`${launchpad.name} launchpad banner`}
            referrerPolicy="no-referrer"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
          />
        ) : (
          <div
            aria-hidden="true"
            className="size-full bg-[radial-gradient(circle_at_50%_120%,rgb(var(--signal)/0.18),transparent_55%),linear-gradient(135deg,rgb(var(--panel-2)),rgb(var(--bg)))]"
          />
        )}
      </div>
      <div className="flex items-center gap-3 p-4">
        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border border-line-strong bg-panel-2">
          {launchpad.logoUrl ? (
            <img
              src={launchpad.logoUrl}
              alt={`${launchpad.name} logo`}
              referrerPolicy="no-referrer"
              className="size-full rounded-full object-cover"
            />
          ) : (
            <span className="font-mono text-sm">{launchpad.name.slice(0, 2).toUpperCase()}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium">{launchpad.name}</h3>
          <p className="t-label mt-1 truncate text-muted">
            {launchpad.protection.enabled ? 'Protected launch' : 'Open launch'} ·{' '}
            {quoteAsset?.symbol ?? 'Quote token'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="t-label text-faint">{tradeFee}% trading fee</p>
            <ReputationBadge
              reputation={launchpad.reputation}
              quoteSymbol={quoteAsset?.symbol ?? 'quote'}
            />
          </div>
        </div>
        <span className="t-label inline-flex shrink-0 items-center gap-1 text-fg">
          Open <ArrowRight aria-hidden="true" className="size-3.5" />
        </span>
      </div>
    </Link>
  );
}

function LaunchpadActions({
  launchpad,
  onChanged,
}: {
  launchpad: ApiLaunchpad;
  onChanged?: (() => void) | undefined;
}) {
  const [liked, setLiked] = useState(launchpad.viewer.liked);
  const [reposted, setReposted] = useState(launchpad.viewer.reposted);
  const [likes, setLikes] = useState(launchpad.social.likes);
  const [reposts, setReposts] = useState(launchpad.social.reposts);
  const [replies, setReplies] = useState(launchpad.social.replies);
  const [quotes, setQuotes] = useState(launchpad.social.quotes);
  const [views, setViews] = useState(launchpad.social.views);
  const [comments, setComments] = useState<readonly ApiLaunchpadReply[]>(launchpad.comments);
  const [composer, setComposer] = useState<'reply' | 'quote' | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const user = useSession(state => state.user);
  const openSignIn = useSession(state => state.openSignIn);
  const showToast = useToast(state => state.show);

  useEffect(() => {
    const node = actionsRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    let recorded = false;
    const observer = new IntersectionObserver(
      entries => {
        if (recorded || !entries.some(entry => entry.isIntersecting)) return;
        recorded = true;
        observer.disconnect();
        void browserApiRequest(`/v1/launchpads/${launchpad.id}/view`, ApiViewCountSchema, {
          method: 'POST',
        })
          .then(response => setViews(response.views))
          .catch(() => undefined);
      },
      { threshold: 0.5 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [launchpad.id]);

  const share = async () => {
    const url = `${window.location.origin}/lp/${encodeURIComponent(launchpad.slug)}`;
    const intent = new URL('https://x.com/intent/tweet');
    intent.searchParams.set('text', `${launchpad.name} created a new launchpad on Femeora.`);
    intent.searchParams.set('url', url);
    const popup = window.open(
      intent.toString(),
      '_blank',
      'noopener,noreferrer,width=720,height=640'
    );
    if (!popup) {
      await navigator.clipboard.writeText(url).catch(() => undefined);
      showToast('The public launchpad link was copied.', {
        title: 'Launchpad link copied',
        userFacing: true,
      });
    }
  };

  const toggle = async (action: 'like' | 'repost') => {
    if (!user) {
      openSignIn();
      return;
    }
    if (pending) return;
    const active = action === 'like' ? liked : reposted;
    const setActive = action === 'like' ? setLiked : setReposted;
    const setCount = action === 'like' ? setLikes : setReposts;
    setActive(!active);
    setCount(count => Math.max(0, count + (active ? -1 : 1)));
    setPending(action);
    try {
      const response = await browserApiRequest(
        `/v1/launchpads/${launchpad.id}/${action}`,
        ApiSocialToggleSchema,
        { method: active ? 'DELETE' : 'POST' }
      );
      setActive(response.active);
      onChanged?.();
    } catch (error) {
      setActive(active);
      setCount(count => Math.max(0, count + (active ? 1 : -1)));
      showToast(error instanceof Error ? error.message : 'SOCIAL_ACTION_FAILED', {
        title: 'Could not update activity',
        tone: 'error',
      });
    } finally {
      setPending(null);
    }
  };

  const openComposer = (kind: 'reply' | 'quote', nextParentId: string | null = null) => {
    if (!user) {
      openSignIn();
      return;
    }
    setComposer(kind);
    setParentId(nextParentId);
    setMessage('');
  };

  const submit = async () => {
    if (!composer || !message.trim() || pending) return;
    const kind = composer;
    setPending(kind);
    try {
      const response = await browserApiRequest(
        `/v1/launchpads/${launchpad.id}/${kind === 'quote' ? 'quotes' : 'replies'}`,
        ApiLaunchpadReplySchema,
        {
          method: 'POST',
          body: { body: message.trim(), parentId: kind === 'reply' ? parentId : null },
        }
      );
      setComments(current => [...current, response]);
      if (kind === 'quote') setQuotes(count => count + 1);
      else setReplies(count => count + 1);
      setComposer(null);
      setParentId(null);
      setMessage('');
      onChanged?.();
      showToast(kind === 'quote' ? 'Quote posted.' : 'Reply posted.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'POST_FAILED', {
        title: 'Could not publish',
        tone: 'error',
      });
    } finally {
      setPending(null);
    }
  };

  const removeComment = async (comment: ApiLaunchpadReply) => {
    if (pending) return;
    setPending(comment.id);
    try {
      await browserApiRequest(
        `/v1/launchpads/${launchpad.id}/replies/${comment.id}`,
        z.undefined(),
        { method: 'DELETE' }
      );
      setComments(current => current.filter(item => item.id !== comment.id));
      if (comment.kind === 'quote') setQuotes(count => Math.max(0, count - 1));
      else setReplies(count => Math.max(0, count - 1));
      onChanged?.();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'DELETE_FAILED', {
        title: 'Could not delete post',
        tone: 'error',
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <div ref={actionsRef} className="t-label mt-2 text-muted">
      <div className="flex flex-wrap items-center gap-0.5 sm:gap-1">
        <button
          type="button"
          onClick={() => void share()}
          className={actionClass}
          aria-label="Share launchpad to X"
        >
          <Share2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => openComposer('quote')}
          className={actionClass}
          aria-expanded={composer === 'quote'}
          aria-label="Quote launchpad"
        >
          <MessageSquareQuote aria-hidden="true" className="size-4" strokeWidth={1.75} />
          {quotes}
        </button>
        <button
          type="button"
          onClick={() => void toggle('like')}
          disabled={pending === 'like'}
          className={actionClass}
          aria-pressed={liked}
          aria-label={liked ? 'Unlike launchpad' : 'Like launchpad'}
        >
          <Heart
            aria-hidden="true"
            className={cn('size-4', liked && 'fill-current')}
            strokeWidth={1.75}
          />
          {likes}
        </button>
        <button
          type="button"
          onClick={() => void toggle('repost')}
          disabled={pending === 'repost'}
          className={actionClass}
          aria-pressed={reposted}
          aria-label={reposted ? 'Undo launchpad repost' : 'Repost launchpad'}
        >
          <Repeat2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
          {reposts}
        </button>
        <button
          type="button"
          onClick={() => openComposer('reply')}
          className={actionClass}
          aria-expanded={composer === 'reply'}
          aria-label="Reply to launchpad"
        >
          <MessageCircle aria-hidden="true" className="size-4" strokeWidth={1.75} />
          {replies}
        </button>
        <span className="inline-flex items-center gap-1.5 px-1.5">
          <Eye aria-hidden="true" className="size-4" strokeWidth={1.75} />
          {views}
        </span>
      </div>
      {composer ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={event => {
            event.preventDefault();
            void submit();
          }}
        >
          <label htmlFor={`launchpad-message-${launchpad.id}`} className="sr-only">
            {composer === 'quote' ? 'Quote launchpad' : 'Reply to launchpad'}
          </label>
          <textarea
            id={`launchpad-message-${launchpad.id}`}
            value={message}
            onChange={event => setMessage(event.target.value)}
            maxLength={280}
            rows={2}
            placeholder={composer === 'quote' ? 'Add your take' : 'Write a reply'}
            className="min-w-0 flex-1 resize-none rounded-[2px] border border-line bg-transparent px-3 py-2 font-sans text-fg outline-none focus:border-signal"
          />
          <button
            type="submit"
            disabled={!message.trim() || pending === composer}
            className="self-end rounded-[2px] bg-signal px-3 py-2 text-bg disabled:opacity-50"
          >
            {pending === composer ? 'Posting…' : composer === 'quote' ? 'Quote' : 'Reply'}
          </button>
        </form>
      ) : null}
      {comments.some(comment => comment.kind === 'reply') ? (
        <ol className="mt-3 grid gap-2 border-t border-line pt-3">
          {comments
            .filter(comment => comment.kind === 'reply')
            .map(comment => (
              <li
                key={comment.id}
                className={cn(
                  'flex gap-2 rounded-[2px] bg-panel-2/60 p-3',
                  comment.parentId && 'ml-6'
                )}
              >
                <Avatar
                  seed={comment.user.handle}
                  src={comment.user.avatarUrl}
                  alt={`${comment.user.name ?? comment.user.handle} avatar`}
                  size="xs"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-sans text-[0.8125rem] font-medium text-fg">
                      {comment.user.name ?? comment.user.handle}
                    </span>
                    {comment.user.xVerified ? (
                      <BadgeCheck aria-label="X verified" className="size-3.5 text-signal" />
                    ) : null}
                    <span className="text-faint">@{comment.user.handle.replace(/^@/, '')}</span>
                    {user?.id === comment.user.id ? (
                      <button
                        type="button"
                        onClick={() => void removeComment(comment)}
                        disabled={pending === comment.id}
                        className="ml-auto grid size-8 place-items-center hover:text-down"
                        aria-label="Delete reply"
                      >
                        <Trash2 aria-hidden="true" className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words font-sans text-[0.875rem] text-fg">
                    {comment.body}
                  </p>
                  <button
                    type="button"
                    onClick={() => openComposer('reply', comment.id)}
                    className="mt-1 min-h-8 text-signal"
                  >
                    Reply
                  </button>
                </div>
              </li>
            ))}
        </ol>
      ) : null}
    </div>
  );
}

export function LaunchpadCreatedPost({
  launchpad,
  quoteAsset,
  onChanged,
}: {
  launchpad: ApiLaunchpad;
  quoteAsset?: ApiPoolAsset | undefined;
  onChanged?: (() => void) | undefined;
}) {
  const profile = launchpad.ownerProfile;
  const handle = (profile?.handle ?? launchpad.xHandle).replace(/^@/, '');
  const name = profile?.name ?? launchpad.name;
  return (
    <article className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-line px-gutter py-5">
      <Avatar
        seed={handle || launchpad.owner}
        src={profile?.avatarUrl ?? launchpad.logoUrl}
        alt={`${name} avatar`}
        size="lg"
      />
      <div className="min-w-0">
        <header className="flex flex-wrap items-center gap-x-1.5 text-[0.9375rem]">
          <span className="font-medium">{name}</span>
          {profile?.xVerified ? (
            <BadgeCheck aria-label="X verified" className="size-4 text-signal" />
          ) : null}
          <span className="t-label text-faint">
            @{handle} · {elapsedLabel(launchpad.createdAt)}
          </span>
        </header>
        <p className="mt-1">Created a new launchpad</p>
        <div className="mt-3">
          <LaunchpadAttachment launchpad={launchpad} quoteAsset={quoteAsset} />
        </div>
        <LaunchpadActions launchpad={launchpad} onChanged={onChanged} />
      </div>
    </article>
  );
}

export function LaunchpadQuotePost({
  launchpad,
  quote,
  quoteAsset,
  onChanged,
}: {
  launchpad: ApiLaunchpad;
  quote: ApiLaunchpadReply;
  quoteAsset?: ApiPoolAsset | undefined;
  onChanged?: (() => void) | undefined;
}) {
  const user = useSession(state => state.user);
  const showToast = useToast(state => state.show);
  const [deleted, setDeleted] = useState(false);
  if (deleted) return null;
  const remove = async () => {
    try {
      await browserApiRequest(`/v1/launchpads/${launchpad.id}/replies/${quote.id}`, z.undefined(), {
        method: 'DELETE',
      });
      setDeleted(true);
      onChanged?.();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'DELETE_FAILED', {
        title: 'Could not delete quote',
        tone: 'error',
      });
    }
  };
  return (
    <article className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-line px-gutter py-5">
      <Avatar
        seed={quote.user.handle}
        src={quote.user.avatarUrl}
        alt={`${quote.user.name ?? quote.user.handle} avatar`}
        size="lg"
      />
      <div className="min-w-0">
        <header className="flex flex-wrap items-center gap-x-1.5 text-[0.9375rem]">
          <span className="font-medium">{quote.user.name ?? quote.user.handle}</span>
          {quote.user.xVerified ? (
            <BadgeCheck aria-label="X verified" className="size-4 text-signal" />
          ) : null}
          <span className="t-label text-faint">
            @{quote.user.handle.replace(/^@/, '')} · {elapsedLabel(quote.createdAt)}
          </span>
          {user?.id === quote.user.id ? (
            <button
              type="button"
              onClick={() => void remove()}
              className="ml-auto grid size-9 place-items-center text-muted hover:text-down"
              aria-label="Delete quote"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </header>
        <p className="mt-1 whitespace-pre-wrap">{quote.body}</p>
        <div className="mt-3">
          <LaunchpadAttachment launchpad={launchpad} quoteAsset={quoteAsset} compact />
        </div>
      </div>
    </article>
  );
}
