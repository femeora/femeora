'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { loader } from '@/content/landing';
import { cn } from '@/lib/cn';

/**
 * Full-screen terminal loader. It types a short boot log on the first visit of a
 * session and a route log when navigating to or from the landing page. Moves
 * between app tabs stay instant so the trading UI never waits on decoration.
 *
 * The overlay is server-rendered so the first paint is already the terminal; the
 * inline script in the root layout adds `booted` to <html> for returning visits
 * and reduced motion, which hides it before paint (see `.route-loader` in
 * globals.css). Without JS it never shows.
 */

type Phase = 'boot' | 'nav' | 'exit' | 'idle';

const LINE_MS = 120;
const MIN_NAV_MS = 620;
const EXIT_MS = 560;
const FAILSAFE_MS = 8_000;
const BOOT_KEY = 'femeora:booted';

/** Only transitions that cross the landing page get the full-screen treatment. */
function crossesLanding(from: string, to: string) {
  return from !== to && (from === '/' || to === '/');
}

function internalTarget(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.('a');
  if (!anchor || !anchor.href || anchor.hasAttribute('download')) return null;
  if (anchor.target && anchor.target !== '_self') return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  return url.pathname;
}

export function RouteLoader() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>('boot');
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<'boot' | 'nav'>('boot');
  const [target, setTarget] = useState('/');
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const phaseRef = useRef<Phase>('boot');
  const pathRef = useRef(pathname);

  const lines = kind === 'nav' ? loader.navigate : loader.boot;

  phaseRef.current = phase;

  // First load: play the boot log once per session.
  useEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains('booted')) {
      setPhase('idle');
      return;
    }
    startedAt.current = performance.now();
    try {
      sessionStorage.setItem(BOOT_KEY, '1');
    } catch {
      /* storage can be unavailable in private modes */
    }
  }, []);

  // Type the log one line at a time. A route log holds its last line until the
  // new route has actually rendered, so the log never claims more than happened.
  useEffect(() => {
    if (phase !== 'boot' && phase !== 'nav') return;
    const total = (phase === 'boot' ? loader.boot : loader.navigate).length;
    const cap = phase === 'boot' ? total + 1 : total - 1;
    if (step < cap) {
      const id = window.setTimeout(() => setStep(current => current + 1), LINE_MS);
      return () => window.clearTimeout(id);
    }
    if (phase === 'boot') {
      const id = window.setTimeout(() => setPhase('exit'), 260);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [phase, step]);

  // Real elapsed time for the corner readout.
  useEffect(() => {
    if (phase === 'idle') return;
    let frame = requestAnimationFrame(function loop(now) {
      setElapsed((now - startedAt.current) / 1000);
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  // Leave once the new route has rendered and the log had time to read.
  useEffect(() => {
    const previous = pathRef.current;
    pathRef.current = pathname;
    if (phaseRef.current !== 'nav' || previous === pathname) return;
    const wait = Math.max(0, MIN_NAV_MS - (performance.now() - startedAt.current));
    const id = window.setTimeout(() => {
      setStep(loader.navigate.length + 1);
      setPhase('exit');
    }, wait);
    return () => window.clearTimeout(id);
  }, [pathname]);

  useEffect(() => {
    if (phase !== 'exit') return;
    const id = window.setTimeout(() => setPhase('idle'), EXIT_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'nav') return;
    const id = window.setTimeout(() => setPhase('exit'), FAILSAFE_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  // Intercept internal link clicks before Next navigates.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const next = internalTarget(event);
      if (!next || phaseRef.current !== 'idle') return;
      if (!crossesLanding(window.location.pathname, next)) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      startedAt.current = performance.now();
      setTarget(next);
      setKind('nav');
      setStep(0);
      setPhase('nav');
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  if (phase === 'idle') return null;

  const shown = Math.min(step, lines.length);
  const progress = Math.min(1, step / (lines.length + 1));
  const command = kind === 'boot' ? '--boot' : `open ${target}`;

  return (
    <div
      aria-hidden="true"
      data-phase={phase}
      className={cn(
        'route-loader fixed inset-0 z-[100] bg-bg text-fg',
        phase === 'exit' && 'route-loader--exit'
      )}
    >
      <div className="route-loader__scan pointer-events-none absolute inset-0" />
      <div className="wrap relative flex h-full flex-col justify-between py-6 md:py-10">
        <div className="t-label flex items-center justify-between text-faint">
          <span>{loader.prompt} / terminal</span>
          <span className="tabular-nums">T+{elapsed.toFixed(3)}s</span>
        </div>

        <div className="w-full max-w-[40rem] font-mono text-[0.8125rem] leading-relaxed md:text-sm">
          <p className="text-fg">
            <span className="text-faint">{loader.prompt}:~$ </span>
            {command}
          </p>
          <ol className="mt-4 flex flex-col gap-1.5">
            {lines.slice(0, shown).map((line, index) => (
              <li
                key={line.label}
                className="route-loader__line flex items-baseline gap-3 text-muted"
              >
                <span className="text-faint tabular-nums">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="text-fg/85">{line.label}</span>
                <span className="mb-[0.3em] h-px flex-1 border-b border-dotted border-fg/20" />
                <span className="text-fg">{line.status}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 flex items-center gap-2 text-fg">
            <span className="text-faint">{loader.prompt}:~$</span>
            {step > lines.length ? <span>{loader.ready}</span> : null}
            <span className="route-loader__caret inline-block h-[1.05em] w-[0.55em] bg-fg" />
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="h-px w-full bg-fg/10">
            <div
              className="h-px origin-left bg-fg transition-transform duration-base ease-out-expo"
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
          <div className="t-label flex justify-between text-faint">
            <span>
              {Math.round(progress * 100)
                .toString()
                .padStart(3, '0')}
              %
            </span>
            <span>Robinhood Chain</span>
          </div>
        </div>
      </div>
    </div>
  );
}
