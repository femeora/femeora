'use client';

import { PoolTerminal } from '@/features/pool/components/PoolTerminal';
import { useElementSize } from '@/hooks/useElementSize';

/** Width the terminal is laid out at before being scaled into the frame. */
const DESKTOP_WIDTH = 1440;
/** Below this container width the terminal renders at its own (mobile) layout, unscaled. */
const SCALE_FROM = 768;
/** Visible slice of the terminal, in unscaled pixels. */
const VISIBLE_HEIGHT = 900;

/** `inert` keeps the embedded controls out of the tab order and away from clicks. */
const markInert = (node: HTMLDivElement | null) => node?.setAttribute('inert', '');

interface AppPreviewProps {
  frameUrl: string;
}

/**
 * The real trade terminal rendered as a non-interactive illustration inside a
 * browser frame, so the landing page always shows the app as it actually is.
 */
export function AppPreview({ frameUrl }: AppPreviewProps) {
  const { ref, width } = useElementSize<HTMLDivElement>();

  const scaled = width >= SCALE_FROM;
  const scale = scaled ? width / DESKTOP_WIDTH : 1;

  return (
    <figure className="overflow-hidden rounded-md border border-line-strong bg-bg shadow-[0_40px_80px_-30px_rgb(0_0_0/0.8)]">
      <div
        className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2.5"
        aria-hidden="true"
      >
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-fg/20" />
          <span className="size-2.5 rounded-full bg-fg/20" />
          <span className="size-2.5 rounded-full bg-fg/20" />
        </span>
        <span className="t-label flex-1 truncate rounded-[2px] bg-bg/60 px-3 py-1 text-center text-muted">
          {frameUrl}
        </span>
      </div>

      <div
        ref={ref}
        className="relative overflow-hidden"
        style={{ height: VISIBLE_HEIGHT * scale }}
      >
        {width > 0 ? (
          <div
            ref={markInert}
            aria-hidden="true"
            className="pointer-events-none origin-top-left select-none"
            style={{ width: scaled ? DESKTOP_WIDTH : width, transform: `scale(${scale})` }}
          >
            <PoolTerminal />
          </div>
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg to-transparent" />
      </div>
      <figcaption className="sr-only">
        Preview of the Fomeora trade terminal: pool header, chart with liquidity bins and callout
        markers, and the Create Position panel.
      </figcaption>
    </figure>
  );
}
