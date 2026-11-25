'use client';

import { ApiCreatedCalloutSchema, CalloutCaptionSchema, type ApiIndexedPosition } from '@fomeora/types';
import { useId, useRef, useState } from 'react';

import { friendlyErrorMessage } from '@/components/feedback/friendlyError';
import { useToast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Close } from '@/components/ui/icons';
import { Switch } from '@/components/ui/Switch';
import { useSession } from '@/features/session/store';
import { useWallet } from '@/features/wallet/store';
import { browserApiRequest } from '@/lib/api/client';
import { cn } from '@/lib/cn';

const CAPTION_MAX = 280;
const CAPTION_WARN = 260;

interface PostPositionCalloutButtonProps {
  position: ApiIndexedPosition;
  onPosted: () => Promise<unknown>;
  className?: string;
}

/** User-authored callout composer for an already indexed position. */
export function PostPositionCalloutButton({ position, onPosted, className }: PostPositionCalloutButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const captionId = useId();
  const { user, openSignIn } = useSession();
  const config = useWallet(state => state.config);
  const showToast = useToast(state => state.show);
  const [caption, setCaption] = useState('');
  const [showSize, setShowSize] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!position.poolCanonical) {
    return (
      <div className={cn('flex flex-wrap items-center gap-2', className)}>
        <Button
          className="min-h-9"
          disabled
          title="This position belongs to a legacy pool. New callouts can only be posted from the active pool."
        >
          Callout unavailable
        </Button>
        {position.replacementPoolAddress ? (
          <ButtonLink
            className="min-h-9 px-3"
            href={`/p/${position.chainId}/${position.replacementPoolAddress}`}
          >
            Active pool
          </ButtonLink>
        ) : null}
      </div>
    );
  }

  const open = () => {
    if (!user) {
      openSignIn();
      return;
    }
    setError(null);
    dialogRef.current?.showModal();
  };

  const close = () => dialogRef.current?.close();

  const submit = async () => {
    const parsed = CalloutCaptionSchema.safeParse(caption);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please revise the caption.');
      return;
    }
    if (!config) {
      setError('The active network is unavailable. Please reconnect your wallet.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await browserApiRequest('/v1/callouts/from-position', ApiCreatedCalloutSchema, {
        method: 'POST',
        body: { chainId: config.chainId, positionId: position.id, caption, showSize },
      });
      await onPosted();
      close();
      setCaption('');
      showToast('Your callout is now live.', { title: 'Callout posted' });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'CALLOUT_POST_FAILED';
      setError(friendlyErrorMessage(message));
      showToast(message, { title: 'Callout could not be posted', tone: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return <>
    <Button className={cn('min-h-9', className)} onClick={open}>
      {user ? 'Post callout' : 'Connect X to post'}
    </Button>
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] glass-raised rounded-[2px] p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <form method="dialog" className="p-5" onSubmit={event => event.preventDefault()}>
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="t-label text-muted">Position #{position.id}</p>
            <h2 id={titleId} className="mt-1 text-lg font-medium">Post a callout</h2>
          </div>
          <button type="button" onClick={close} aria-label="Close callout composer" className="grid size-11 place-items-center text-muted hover:text-fg">
            <Close aria-hidden="true" className="size-5" />
          </button>
        </header>
        <p className="mt-3 text-sm text-muted">Share your own view of this position. The range and on-chain position are attached automatically.</p>
        <label htmlFor={captionId} className="t-label mt-5 block text-muted">Caption · optional</label>
        <textarea
          id={captionId}
          rows={4}
          value={caption}
          maxLength={CAPTION_MAX}
          placeholder="What's your play?"
          aria-invalid={Boolean(error)}
          onChange={event => { setCaption(event.target.value); setError(null); }}
          className={cn('mt-2 w-full resize-none rounded-[2px] border bg-transparent p-3 text-[0.9375rem] placeholder:text-faint', error ? 'border-down' : 'glass-control')}
        />
        <div className="t-label mt-1 flex justify-between gap-3">
          <span role="alert" className="text-down">{error}</span>
          <span className={caption.length >= CAPTION_WARN ? 'text-down' : 'text-faint'}>{caption.length} / {CAPTION_MAX}</span>
        </div>
        <div className="mt-3 border-y border-line">
          <Switch label="Show size" hint={showSize ? 'Callout shows the position value' : 'Callout hides the position value'} checked={showSize} onChange={setShowSize} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
          <Button type="button" variant="primary" disabled={submitting} onClick={() => void submit()}>{submitting ? 'Posting…' : 'Post callout'}</Button>
        </div>
      </form>
    </dialog>
  </>;
}
