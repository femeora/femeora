'use client';

import { useId } from 'react';

import { Switch } from '@/components/ui/Switch';
import { cn } from '@/lib/cn';

import { CAPTION_MAX, CAPTION_WARN } from '../hooks/usePositionDraft';

interface CalloutComposerProps {
  enabled: boolean;
  caption: string;
  showSize: boolean;
  error: string | null;
  onEnabledChange: (enabled: boolean) => void;
  onCaptionChange: (caption: string) => void;
  onShowSizeChange: (showSize: boolean) => void;
}

/**
 * "Post as callout" toggle with the user-written caption box (brief 5.4.1).
 * The caption is never prefilled or generated.
 */
export function CalloutComposer({
  enabled,
  caption,
  showSize,
  error,
  onEnabledChange,
  onCaptionChange,
  onShowSizeChange,
}: CalloutComposerProps) {
  const captionId = useId();
  const counterId = useId();
  const errorId = useId();

  return (
    <fieldset className="rounded-[2px] border border-line px-3">
      <legend className="sr-only">Callout</legend>
      <Switch
        label="Post as callout"
        hint="Goes live when the tx confirms"
        checked={enabled}
        onChange={onEnabledChange}
      />

      {enabled ? (
        <div className="flex flex-col gap-2 border-t border-line py-3">
          <label htmlFor={captionId} className="t-label text-muted">
            Caption · optional
          </label>
          <textarea
            id={captionId}
            rows={3}
            value={caption}
            placeholder="What's your play?"
            maxLength={CAPTION_MAX}
            aria-describedby={`${counterId}${error ? ` ${errorId}` : ''}`}
            aria-invalid={Boolean(error)}
            onChange={event => onCaptionChange(event.target.value)}
            className={cn(
              'resize-none rounded-[2px] border bg-transparent p-2 text-[0.9375rem] placeholder:text-faint',
              error ? 'border-down' : 'border-line-strong'
            )}
          />
          <div className="t-label flex justify-between gap-3">
            <span id={errorId} role="alert" className="text-down">
              {error}
            </span>
            <span
              id={counterId}
              className={cn(
                'shrink-0 tabular-nums',
                caption.length >= CAPTION_WARN ? 'text-warn' : 'text-faint'
              )}
            >
              {caption.length} / {CAPTION_MAX}
            </span>
          </div>
          <Switch
            label="Show size"
            hint={showSize ? 'Card shows position in $' : 'Card shows Hidden, earned as %'}
            checked={showSize}
            onChange={onShowSizeChange}
          />
        </div>
      ) : null}
    </fieldset>
  );
}
