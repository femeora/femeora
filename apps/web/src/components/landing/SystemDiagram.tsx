import { GlowCard } from '@/components/ui/GlowCard';
import { ArrowDown, ArrowRight } from '@/components/ui/icons';
import type { SystemNode } from '@/content/landing';
import { cn } from '@/lib/cn';

const LAYER_TONE: Record<SystemNode['layer'], string> = {
  Client: 'text-fg',
  'On-chain': 'text-signal',
  'Off-chain': 'text-up',
};

/**
 * Left-to-right flow of a callout through the stack (brief 5.4 server flow).
 * Stacks vertically on small screens; arrows follow the direction.
 */
export function SystemDiagram({ title, nodes }: { title: string; nodes: readonly SystemNode[] }) {
  return (
    <figure>
      <figcaption className="t-label mb-4 text-muted">{title}</figcaption>
      <ol className="grid gap-3 md:grid-cols-5 md:gap-0">
        {nodes.map((node, index) => (
          <li key={node.title} className="relative flex md:pr-6">
            <GlowCard className="w-full">
              <div className="flex flex-col gap-2 p-4">
                <span className={cn('t-label', LAYER_TONE[node.layer])}>
                  {String(index + 1).padStart(2, '0')} · {node.layer}
                </span>
                <span className="text-lg font-medium">{node.title}</span>
                <span className="text-[0.9375rem] text-muted">{node.detail}</span>
              </div>
            </GlowCard>
            {index < nodes.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute -bottom-3 left-6 z-10 flex justify-center text-faint md:-right-0 md:bottom-auto md:left-auto md:top-1/2 md:w-6 md:-translate-y-1/2"
              >
                <ArrowDown className="size-3.5 md:hidden" strokeWidth={2} />
                <ArrowRight className="hidden size-3.5 md:inline" strokeWidth={2} />
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </figure>
  );
}
