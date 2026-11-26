'use client';

import { Download, Share, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function PwaBootstrap() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' });
    }
    if (isStandalone()) return;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const remembered = window.localStorage.getItem('femeora.install.dismissed') === '1';
    setShowIos(ios);
    setDismissed(remembered);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
      setDismissed(remembered);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const hide = () => {
    window.localStorage.setItem('femeora.install.dismissed', '1');
    setDismissed(true);
  };

  const install = async () => {
    if (prompt) {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') setPrompt(null);
      hide();
      return;
    }
    if (showIos) dialogRef.current?.showModal();
  };

  const visible = !dismissed && Boolean(prompt || showIos);

  return (
    <>
      {visible ? (
        <aside className="fixed bottom-20 left-1/2 z-[70] flex w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-[2px] border border-line bg-panel px-4 py-3 shadow-2xl md:bottom-5" aria-label="Install Femeora">
          <Download aria-hidden="true" className="size-5 shrink-0 text-fg" />
          <p className="min-w-0 flex-1 text-sm text-muted">
            Install Femeora for a full-screen mobile experience.
          </p>
          <Button variant="primary" onClick={() => void install()} className="min-h-9 px-3">
            Install
          </Button>
          <button type="button" onClick={hide} aria-label="Dismiss install prompt" className="grid size-10 place-items-center text-muted hover:text-fg">
            <X aria-hidden="true" className="size-4" />
          </button>
        </aside>
      ) : null}
      <dialog ref={dialogRef} className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-[2px] border border-line bg-panel p-0 text-fg backdrop:bg-black/70">
        <section className="p-6">
          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="t-label text-muted">Install on iPhone or iPad</p>
              <h2 className="mt-2 text-2xl">Add Femeora to your Home Screen</h2>
            </div>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close install instructions" className="grid size-10 place-items-center text-muted hover:text-fg">
              <X aria-hidden="true" className="size-5" />
            </button>
          </header>
          <ol className="mt-6 grid gap-4 text-sm text-muted">
            <li className="flex gap-3"><Share aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-fg" /><span>Open Femeora in Safari and tap the Share button.</span></li>
            <li className="flex gap-3"><Download aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-fg" /><span>Select <strong className="text-fg">Add to Home Screen</strong>, then confirm Add.</span></li>
          </ol>
        </section>
      </dialog>
    </>
  );
}
