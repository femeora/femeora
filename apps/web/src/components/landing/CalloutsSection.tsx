import Link from 'next/link';

import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHead } from '@/components/ui/SectionHead';
import { callouts } from '@/content/landing';

import { CalloutSpecimen3D } from './CalloutSpecimen3D';

/** The callout as an object: a 3D card on the left, the three facts it proves on the right. */
export function CalloutsSection() {
  return (
    <section id="callouts" aria-labelledby="callouts-title" className="section-tight">
      <div className="wrap">
        <SectionHead
          id="callouts-title"
          cue={callouts.cue}
          label={callouts.label}
          title={callouts.title}
        />

        <div className="grid-12 mt-12 items-center gap-y-12 md:mt-16">
          <div className="col-span-12 py-6 lg:col-span-7">
            <CalloutSpecimen3D />
          </div>

          <ol className="col-span-12 flex flex-col gap-3 lg:col-span-5">
            {callouts.facts.map((fact, index) => (
              <li key={fact.title}>
                <Reveal delay={index * 80}>
                  <LiquidGlass className="grid grid-cols-[2.5rem_1fr] gap-x-3 p-5 md:p-6">
                    <span className="t-label pt-1 text-faint">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h3 className="text-[1.25rem] font-medium leading-tight tracking-tight">
                        {fact.title}
                      </h3>
                      <p className="mt-2 text-muted">{fact.detail}</p>
                    </div>
                  </LiquidGlass>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>

        <Link
          href={callouts.more.href}
          className="t-label mt-10 inline-flex min-h-11 items-center gap-1.5 text-fg transition-colors hover:text-signal"
        >
          {callouts.more.label}
        </Link>
      </div>
    </section>
  );
}
