'use client';

import { useEffect, useRef } from 'react';

/**
 * Scroll-linked progress written straight to a CSS variable (`--progress`, 0..1),
 * so scroll motion is pure CSS and never re-renders React.
 *
 * - `cross`: 0 when the element's top meets the viewport bottom, 1 when its
 *   bottom leaves the viewport top.
 * - `enter`: 0 when the top is at `start` of the viewport height, 1 when it
 *   reaches `end` (fractions, 1 = bottom edge).
 *
 * All elements share one passive scroll listener and one rAF per frame. Under
 * reduced motion progress is pinned to `settled` (default 1), the resting state.
 */
export interface ScrollProgressOptions {
  mode?: 'cross' | 'enter';
  start?: number;
  end?: number;
  settled?: number;
}

interface Entry {
  node: HTMLElement;
  options: Required<Omit<ScrollProgressOptions, 'settled'>>;
  last: number;
}

const entries = new Set<Entry>();
let frame = 0;
let listening = false;

function measure(entry: Entry, viewport: number) {
  const rect = entry.node.getBoundingClientRect();
  const { mode, start, end } = entry.options;
  const raw =
    mode === 'cross'
      ? (viewport - rect.top) / (viewport + rect.height)
      : (start * viewport - rect.top) / Math.max(1, (start - end) * viewport);
  const progress = Math.min(1, Math.max(0, raw));
  const rounded = Math.round(progress * 1000) / 1000;
  if (rounded !== entry.last) {
    entry.last = rounded;
    entry.node.style.setProperty('--progress', String(rounded));
  }
}

function update() {
  frame = 0;
  const viewport = window.innerHeight;
  entries.forEach(entry => measure(entry, viewport));
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(update);
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
}

function unlisten() {
  if (!listening || entries.size) return;
  listening = false;
  window.removeEventListener('scroll', schedule);
  window.removeEventListener('resize', schedule);
}

export function useScrollProgress<T extends HTMLElement = HTMLDivElement>({
  mode = 'enter',
  start = 0.9,
  end = 0.35,
  settled = 1,
}: ScrollProgressOptions = {}) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.style.setProperty('--progress', String(settled));
      return;
    }
    const entry: Entry = { node, options: { mode, start, end }, last: -1 };
    entries.add(entry);
    listen();
    measure(entry, window.innerHeight);
    return () => {
      entries.delete(entry);
      unlisten();
    };
  }, [mode, start, end, settled]);

  return ref;
}
