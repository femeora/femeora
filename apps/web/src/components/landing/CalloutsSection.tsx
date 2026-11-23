import Link from 'next/link';

import { SectionHead } from '@/components/ui/SectionHead';
import { callouts } from '@/content/landing';

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
        <div className="mt-10 grid gap-px overflow-hidden rounded-[2px] bg-line md:mt-14 md:grid-cols-3">
          {callouts.facts.map(fact => <article key={fact.title} className="bg-panel p-6"><h3 className="font-medium">{fact.title}</h3><p className="mt-3 text-muted">{fact.detail}</p></article>)}
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
