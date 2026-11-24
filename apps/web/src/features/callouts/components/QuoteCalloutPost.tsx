'use client';

import { useState } from 'react';
import { z } from 'zod';

import { useToast } from '@/components/feedback/toast';
import { Avatar } from '@/components/ui/Avatar';
import { BadgeCheck, Trash2 } from '@/components/ui/icons';
import { browserApiRequest } from '@/lib/api/client';

import type { Callout, CalloutComment } from '../model/callout';

import { CalloutCard } from './CalloutCard';
import { CaptionText } from './CaptionText';

function elapsed(timestamp: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

/** X-style quote post: the quoter owns the outer post and the canonical callout stays embedded. */
export function QuoteCalloutPost({ quote, source, own, onDeleted }: {
  quote: CalloutComment;
  source: Callout;
  own: boolean;
  onDeleted?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const showToast = useToast(state => state.show);
  const remove = async () => {
    setDeleting(true);
    try {
      await browserApiRequest(`/v1/callouts/${source.id}/replies/${quote.id}`, z.undefined(), { method: 'DELETE' });
      showToast('Your quote was removed.', { title: 'Quote deleted' });
      onDeleted?.();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'DELETE_FAILED', { title: 'Could not delete quote', tone: 'error' });
    } finally {
      setDeleting(false);
    }
  };
  return <article id={`quote-${quote.id}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-line px-gutter py-5">
    <Avatar seed={quote.caller.handle} src={quote.caller.avatarUrl} alt={`${quote.caller.name} X avatar`} size="lg" self={own} />
    <div className="min-w-0">
      <header className="flex items-center gap-1.5 text-[0.9375rem]">
        <span className="font-medium">{quote.caller.name}</span>
        {quote.caller.verified ? <BadgeCheck aria-label="X verified" className="size-4 text-signal" /> : null}
        <span className="t-label text-faint">@{quote.caller.handle} · {elapsed(quote.createdAt)}</span>
        {own ? <button type="button" onClick={() => setConfirming(true)} className="ml-auto grid size-9 place-items-center text-muted hover:text-down" aria-label="Delete quote"><Trash2 aria-hidden="true" className="size-4" /></button> : null}
      </header>
      <p className="mt-1 whitespace-pre-wrap"><CaptionText text={quote.body} /></p>
      <div className="mt-3 overflow-hidden rounded-[2px] border border-line bg-panel-2/60 p-3">
        <div className="flex items-center gap-2">
          <Avatar seed={source.caller.handle} src={source.caller.avatarUrl} alt={`${source.caller.name} X avatar`} size="xs" />
          <span className="text-sm font-medium">{source.caller.name}</span>
          <span className="t-label text-faint">@{source.caller.handle}</span>
        </div>
        {source.caption ? <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm"><CaptionText text={source.caption} /></p> : null}
        <div className="mt-3"><CalloutCard callout={source} preview /></div>
      </div>
      {confirming ? <div role="alertdialog" aria-label="Confirm quote deletion" className="mt-3 flex items-center justify-between gap-3 border border-down/50 p-3">
        <span className="text-sm">Delete this quote?</span>
        <div className="flex gap-2"><button type="button" onClick={() => setConfirming(false)} className="min-h-9 px-3 text-muted">Cancel</button><button type="button" disabled={deleting} onClick={() => void remove()} className="min-h-9 border border-down px-3 text-down">{deleting ? 'Deleting…' : 'Delete'}</button></div>
      </div> : null}
    </div>
  </article>;
}
