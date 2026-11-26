import Link from 'next/link';

import { Reveal } from '@/components/ui/Reveal';
import { SectionHead } from '@/components/ui/SectionHead';
import { StatusDot } from '@/components/ui/StatusDot';
import { loop } from '@/content/landing';

import { Pipeline } from './Pipeline';
import { TailMirror } from './TailMirror';

export function LoopSection() {
  return (
    <section id="tail" aria-labelledby="tail-title" className="section">
      <div className="wrap">
        <SectionHead id="tail-title" cue={loop.cue} label={loop.label} title={loop.title} />

        <Reveal className="mt-12 border-t border-line pt-8 md:mt-16">
          <Pipeline steps={loop.steps} />
        </Reveal>

        <div className="mt-12 md:mt-16">
          <TailMirror />
        </div>

        <div className="grid-12 mt-12 gap-y-12 md:mt-16">
          <div className="col-span-12 flex flex-col gap-10 lg:col-span-8">
            <Reveal>
              <p className="text-[clamp(1.125rem,1.6vw,1.375rem)] leading-snug">{loop.body}</p>
            </Reveal>

            <Reveal delay={120} className="t-label flex flex-col gap-5 border-t border-line pt-8">
              <p className="flex items-start gap-2.5 text-fg">
                <StatusDot className="mt-1" />
                {loop.news}
              </p>
              <p className="text-muted">{loop.disclaimer}</p>
              <Link
                href={loop.more.href}
                className="inline-flex min-h-11 items-center gap-1.5 text-fg hover:text-signal"
              >
                {loop.more.label}
              </Link>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
