import { Reveal } from '@/components/ui/Reveal';
import { SectionHead } from '@/components/ui/SectionHead';
import { safety } from '@/content/landing';

import { SafetyStack } from './SafetyStack';

export function SafetySection() {
  return (
    <section id="safety" aria-labelledby="safety-title" className="section-tight">
      <div className="wrap">
        <SectionHead id="safety-title" cue={safety.cue} label={safety.label} title={safety.title} />

        <div className="grid-12 mt-10 gap-y-10 md:mt-14">
          <div className="col-span-12 lg:col-span-5">
            <div className="lg:sticky lg:top-[calc(theme(spacing.header)+3rem)]">
              <SafetyStack layers={safety.items.map(item => item.title)} />
            </div>
          </div>

          <ol className="col-span-12 border-t border-line lg:col-span-7">
            {safety.items.map((item, index) => (
              <li key={item.title} className="border-b border-line">
                <Reveal
                  delay={index * 40}
                  className="grid grid-cols-[2.5rem_1fr] items-baseline gap-x-0 gap-y-2 py-6 md:grid-cols-[3rem_1fr]"
                >
                  <span className="t-label row-span-3 text-muted">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="text-[clamp(1.375rem,2.2vw,2rem)] font-medium leading-tight tracking-tight">
                    {item.title}
                  </h3>
                  <p className="text-muted">{item.detail}</p>
                  <p className="t-label flex flex-wrap gap-x-4 gap-y-1 text-fg">
                    {item.scope.map(scope => (
                      <span key={scope}>{scope}</span>
                    ))}
                  </p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
        <p className="t-label mt-8 text-muted">{safety.footnote}</p>
      </div>
    </section>
  );
}
