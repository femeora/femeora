import { StatusDot } from '@/components/ui/StatusDot';
import type { LoopStep } from '@/content/landing';

/**
 * The five-step loop from login to tail, drawn as a signal chain. A short pulse
 * travels the wire to show direction; it stops under reduced motion.
 */
export function Pipeline({ steps }: { steps: readonly LoopStep[] }) {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-[3px] hidden h-px bg-fg/25 md:block"
      >
        <span className="absolute top-0 h-px w-8 animate-travel bg-signal" />
      </div>
      <ol className="relative grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-5">
        {steps.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-3">
            <span className="flex items-center gap-2">
              <StatusDot tone={step.tone} className="size-[7px]" />
              <span className="t-label text-faint md:hidden">
                {String(index + 1).padStart(2, '0')}
              </span>
            </span>
            <span className="font-medium">{step.title}</span>
            <span className="t-label text-muted">{step.detail}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
