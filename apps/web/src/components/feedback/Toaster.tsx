'use client';

import { Close } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

import { useToast } from './toast';

/** Polite live region for confirmations. Never takes focus. */
export function Toaster() {
  const { message, dismiss } = useToast();

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-gutter lg:bottom-6"
    >
      <div
        className={cn(
          'pointer-events-auto flex items-center gap-4 rounded-[2px] border border-line-strong bg-panel-2 py-2 pl-4 pr-2 shadow-[0_20px_40px_-20px_rgb(0_0_0/0.8)] transition-[opacity,transform] duration-base ease-out-expo',
          message ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
        )}
      >
        <span className="text-[0.9375rem]">{message}</span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="grid size-9 place-items-center text-muted hover:text-fg"
        >
          <Close aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
