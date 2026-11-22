import { CalloutSpecimen } from '@/components/callout/CalloutSpecimen';
import { featuredCallout } from '@/content/landing';

/**
 * Static illustration of the "Post callout" composer sheet (brief 5.4.1).
 * Rendered with non-interactive elements so it never steals focus.
 */
export function ComposerMock() {
  return (
    <figure className="rounded-sm border border-line-strong bg-panel-2 p-4 md:p-6">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <span className="font-medium">Post callout</span>
        <span className="t-label text-muted">Esc</span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 place-items-center rounded-full bg-fg/10 font-mono text-xs"
        >
          AK
        </span>
        <span className="t-label text-muted">@yourhandle · X verified</span>
      </div>

      <div className="mt-4 min-h-24 rounded-sm border border-line-strong bg-bg/60 p-3 text-muted">
        What&apos;s your play?
      </div>
      <p className="t-label mt-2 text-right text-faint">0 / 280</p>

      <CalloutSpecimen callout={featuredCallout} className="mt-4 bg-bg/40" />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <span className="t-label inline-flex items-center gap-2 text-muted">
          <span aria-hidden="true" className="relative h-4 w-7 rounded-full bg-signal">
            <span className="absolute right-0.5 top-0.5 size-3 rounded-full bg-on-signal" />
          </span>
          Show size
        </span>
        <span className="flex gap-2">
          <span className="t-label rounded-[2px] border border-line-strong px-4 py-3">Cancel</span>
          <span className="t-label rounded-[2px] bg-fg px-4 py-3 text-bg">Post</span>
        </span>
      </div>
      <figcaption className="sr-only">
        Callout composer: a caption written by you, and a read-only preview of the position card.
      </figcaption>
    </figure>
  );
}
