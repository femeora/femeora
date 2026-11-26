'use client';

import type { CSSProperties } from 'react';

import { ArrowDown } from '@/components/ui/icons';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import type { SystemNode } from '@/content/landing';
import { useScrollProgress } from '@/hooks/useScrollProgress';

/**
 * Left-to-right flow of a callout through the stack (brief 5.4 server flow).
 * A signal rail runs above the nodes: as the figure scrolls through, a packet
 * travels the rail and each node switches on when it arrives. Stacks vertically
 * on small screens, where the nodes light in order instead.
 */
export function SystemDiagram({ title, nodes }: { title: string; nodes: readonly SystemNode[] }) {
  const ref = useScrollProgress<HTMLElement>({ start: 0.85, end: 0.3 });
  const last = nodes.length - 1;

  return (
    <figure ref={ref} className="system-diagram" style={{ '--last': last } as CSSProperties}>
      <figcaption className="t-label mb-6 flex items-center justify-between text-muted">
        <span>{title}</span>
        <span className="hidden tabular-nums md:inline">
          {String(nodes.length).padStart(2, '0')} hops
        </span>
      </figcaption>

      <div aria-hidden="true" className="relative mb-5 hidden h-6 md:block">
        <div className="absolute inset-x-[10%] top-1/2 h-px bg-fg/15" />
        <div className="system-rail-fill absolute left-[10%] top-1/2 h-px w-[80%] bg-fg" />
        {nodes.map((node, index) => (
          <span
            key={node.title}
            className="system-stop absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-fg/40 bg-bg"
            style={{ left: `${10 + (index / last) * 80}%`, '--i': index } as CSSProperties}
          />
        ))}
        <span className="system-packet absolute left-[10%] top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg shadow-[0_0_24px_6px_rgb(var(--fg)/0.35)]" />
      </div>

      <ol className="grid gap-3 md:grid-cols-5 md:gap-3">
        {nodes.map((node, index) => (
          <li
            key={node.title}
            className="system-node relative flex"
            style={{ '--i': index } as CSSProperties}
          >
            <LiquidGlass className="flex w-full flex-col gap-2 p-4 md:min-h-[12rem]">
              <span className="t-label text-faint">
                {String(index + 1).padStart(2, '0')} · {node.layer}
              </span>
              <span className="text-lg font-medium">{node.title}</span>
              <span className="text-[0.9375rem] text-muted">{node.detail}</span>
            </LiquidGlass>
            {index < last ? (
              <span
                aria-hidden="true"
                className="absolute -bottom-3 left-6 z-10 text-faint md:hidden"
              >
                <ArrowDown className="size-3.5" strokeWidth={2} />
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </figure>
  );
}
