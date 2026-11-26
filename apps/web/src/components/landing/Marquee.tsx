import { ScrollScene } from '@/components/motion/ScrollScene';
import { cn } from '@/lib/cn';

interface MarqueeProps {
  items: readonly { label: string; ours?: boolean }[];
  label: string;
}

/**
 * Infinite ticker of shapes and presets. The list is rendered twice and slid by
 * half its width; the copy is hidden from assistive tech. Pauses on hover, and
 * the whole row drifts with the page scroll on top of its own loop.
 */
export function Marquee({ items, label }: MarqueeProps) {
  const list = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {items.map(item => (
        <li
          key={item.label}
          className={cn(
            'flex items-center whitespace-nowrap text-[clamp(1.4rem,2.8vw,2.5rem)] font-medium leading-none tracking-tight transition-colors duration-fast after:mx-[0.85em] after:inline-block after:h-[0.62em] after:w-[0.16em] after:bg-faint/60 hover:text-fg',
            item.ours ? 'text-fg' : 'text-muted'
          )}
        >
          {item.label}
        </li>
      ))}
    </ul>
  );

  return (
    <section
      aria-label={label}
      className="group overflow-hidden border-y border-line py-10 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)] md:py-14"
    >
      <ScrollScene mode="cross" settled={0.5} className="scroll-drift">
        <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">
          {list(false)}
          {list(true)}
        </div>
      </ScrollScene>
    </section>
  );
}
