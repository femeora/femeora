import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHead } from '@/components/ui/SectionHead';
import { StatusDot } from '@/components/ui/StatusDot';
import { integrity } from '@/content/landing';
import type { IntegritySignal } from '@/content/landing';
import { cn } from '@/lib/cn';

import { IntegrityGlyph } from './IntegrityGlyph';

const BADGE_TONE: Record<IntegritySignal['tone'], string> = {
  down: 'border-down/50 text-down',
  faint: 'border-line-strong text-muted',
  up: 'border-up/50 text-up',
};

/** Anti-shill rules shown without fabricated chart activity. */
export function IntegritySection() {
  return (
    <section id="integrity" aria-labelledby="integrity-title" className="section">
      <div className="wrap">
        <SectionHead
          id="integrity-title"
          cue={integrity.cue}
          label={integrity.label}
          title={integrity.title}
        />

        <Reveal className="mt-10 max-w-[44em] md:mt-14">
          <p>{integrity.body}</p>
        </Reveal>

        <div className="mt-12 md:mt-16">
          <Reveal>
            <ul className="grid gap-3 md:grid-cols-2 md:gap-4">
              {integrity.signals.map(item => (
                <LiquidGlass
                  key={item.id}
                  as="li"
                  className="flex flex-col gap-2 p-6 md:last:odd:col-span-2"
                >
                  <div className="mb-3 text-fg">
                    <IntegrityGlyph id={item.id} />
                  </div>
                  <span className="flex items-center gap-2.5 text-[1.0625rem] font-medium">
                    <StatusDot tone={item.tone} />
                    {item.name}
                  </span>
                  <span className="text-muted">{item.rule}</span>
                  <span
                    className={cn(
                      't-label mt-2 w-fit rounded-[2px] border px-2 py-1',
                      BADGE_TONE[item.tone]
                    )}
                  >
                    {item.badge}
                  </span>
                </LiquidGlass>
              ))}
            </ul>
            <p className="t-label mt-6 text-faint">{integrity.footnote}</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
