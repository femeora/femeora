import Link from 'next/link';

import { ArrowRight } from '@/components/ui/icons';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHead } from '@/components/ui/SectionHead';
import { StatusDot } from '@/components/ui/StatusDot';
import { loop } from '@/content/landing';

import { ComposerMock } from './ComposerMock';
import { Pipeline } from './Pipeline';

export function LoopSection() {
  return (
    <section id="tail" aria-labelledby="tail-title" className="section">
      <div className="wrap">
        <SectionHead id="tail-title" cue={loop.cue} label={loop.label} title={loop.title} />

        <Reveal className="mt-12 border-t border-line pt-8 md:mt-16">
          <Pipeline steps={loop.steps} />
        </Reveal>

        <div className="grid-12 mt-12 gap-y-12 md:mt-16">
          <Reveal className="col-span-12 lg:col-span-7">
            <ComposerMock />
          </Reveal>

          <div className="col-span-12 flex flex-col gap-10 lg:col-span-4 lg:col-start-9">
            <Reveal>
              <p className="text-[clamp(1.125rem,1.6vw,1.375rem)] leading-snug">{loop.body}</p>
            </Reveal>

            <Reveal delay={60}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-8 border-t border-line pt-8">
                {loop.stats.map(stat => (
                  <div key={stat.label} className="flex flex-col gap-2">
                    <dt className="order-2 t-label text-muted">{stat.label}</dt>
                    <dd className="order-1 text-[clamp(1.75rem,2.6vw,2.5rem)] font-medium leading-none tracking-tight">
                      {stat.value}
                    </dd>
                  </div>
                ))}
              </dl>
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
                {loop.more.label}{' '}
                <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2} />
              </Link>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
