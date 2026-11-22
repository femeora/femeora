import { ArrowUp } from '@/components/ui/icons';
import type { Callout } from '@/features/callouts/model/callout';

interface NewCalloutsPillProps {
  items: readonly Callout[];
  onShow: () => void;
}

/** Floating pill with the newest callers' avatars (brief 7.1). Hidden when nothing is buffered. */
export function NewCalloutsPill({ items, onShow }: NewCalloutsPillProps) {
  if (items.length === 0) return null;

  return (
    <div className="sticky top-[7.25rem] z-20 flex h-0 justify-center">
      <button
        type="button"
        onClick={onShow}
        className="t-label flex min-h-10 items-center gap-2 rounded-full bg-signal px-3 text-on-signal shadow-[0_12px_30px_-10px_rgb(0_0_0/0.8)] animate-fade-up"
      >
        <ArrowUp aria-hidden="true" className="size-3.5" strokeWidth={2} />
        <span className="flex -space-x-1.5" aria-hidden="true">
          {items.slice(0, 3).map(item => (
            <span
              key={item.id}
              className="grid size-5 place-items-center rounded-full border border-signal bg-bg font-mono text-[0.5rem] text-fg"
            >
              {item.caller.initials}
            </span>
          ))}
        </span>
        {items.length} new {items.length === 1 ? 'callout' : 'callouts'}
      </button>
    </div>
  );
}
