import { ArrowUp } from '@/components/ui/icons';

interface NewCalloutsPillProps {
  count: number;
  onShow: () => void;
}

/** Floating pill with the newest callers' avatars (brief 7.1). Hidden when nothing is buffered. */
export function NewCalloutsPill({ count, onShow }: NewCalloutsPillProps) {
  if (count === 0) return null;

  return (
    <div className="sticky top-[7.25rem] z-20 flex h-0 justify-center">
      <button
        type="button"
        onClick={onShow}
        className="t-label flex min-h-10 items-center gap-2 rounded-full metal px-3 animate-fade-up"
      >
        <ArrowUp aria-hidden="true" className="size-3.5" strokeWidth={2} />
        {count} new {count === 1 ? 'callout' : 'callouts'}
      </button>
    </div>
  );
}
