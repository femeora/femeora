import { Reveal } from '@/components/ui/Reveal';
import { SectionHead } from '@/components/ui/SectionHead';
import { safety } from '@/content/landing';

export function SafetySection() {
  return (
    <section id="safety" aria-labelledby="safety-title" className="section-tight">
      <div className="wrap">
        <SectionHead id="safety-title" cue={safety.cue} label={safety.label} title={safety.title} />

        <ol className="mt-10 border-t border-line md:mt-14">
          {safety.items.map((item, index) => (
            <li key={item.title} className="border-b border-line">
              <Reveal
                delay={index * 40}
                className="grid grid-cols-[2.5rem_1fr] items-baseline gap-x-0 gap-y-2 py-5 md:grid-cols-[3rem_minmax(0,1fr)_minmax(0,26rem)_minmax(0,14rem)] md:gap-x-6"
              >
                <span className="t-label row-span-3 text-muted md:row-span-1">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="text-h3 font-medium">{item.title}</h3>
                <p className="text-muted">{item.detail}</p>
                <p className="t-label flex flex-wrap gap-x-4 gap-y-1 text-fg md:justify-end">
                  {item.scope.map(scope => (
                    <span key={scope}>{scope}</span>
                  ))}
                </p>
              </Reveal>
            </li>
          ))}
        </ol>
        <p className="t-label mt-8 text-muted">{safety.footnote}</p>
      </div>
    </section>
  );
}
