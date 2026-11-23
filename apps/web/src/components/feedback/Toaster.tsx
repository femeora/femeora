'use client';

import { Close } from '@/components/ui/icons';

import { useToast } from './toast';

const shortHash = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-8)}`;

/** Blocking result modal used for both ordinary activities and transactions. */
export function Toaster() {
  const { message, title, tone, transactionHash, explorerUrl, dismiss } = useToast();

  if (!message) return null;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/65 px-gutter backdrop-blur-sm" role="presentation" onMouseDown={event => event.target === event.currentTarget && dismiss()}>
      <div role="dialog" aria-modal="true" aria-labelledby="activity-result-title" className="glass-raised w-full max-w-md rounded-[2px] p-5 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className={`t-label ${tone === 'error' ? 'text-down' : tone === 'success' ? 'text-up' : 'text-signal'}`}>{tone}</p>
            <h2 id="activity-result-title" className="mt-1 text-2xl font-medium">{title}</h2>
          </div>
          <button type="button" onClick={dismiss} aria-label="Close notification" className="grid size-11 place-items-center text-muted hover:text-fg">
            <Close aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </button>
        </header>
        <p className="mt-4 text-muted">{message}</p>
        {transactionHash ? (
          <div className="glass mt-5 rounded-[2px] p-3">
            <p className="t-label text-faint">Transaction</p>
            {explorerUrl ? (
              <a href={`${explorerUrl.replace(/\/$/, '')}/tx/${transactionHash}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-11 items-center font-mono text-sm text-signal underline underline-offset-4">
                {shortHash(transactionHash)} ↗
              </a>
            ) : <p className="mt-2 break-all font-mono text-sm">{transactionHash}</p>}
          </div>
        ) : null}
        <button type="button" onClick={dismiss} className="metal t-label mt-6 min-h-11 w-full rounded-[2px] px-4">Done</button>
      </div>
    </div>
  );
}
