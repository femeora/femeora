import Link from 'next/link';

import { ArrowRight } from '@/components/ui/icons';
import { SectionHead } from '@/components/ui/SectionHead';
import { callouts } from '@/content/landing';

import { CalloutList } from './CalloutList';

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
        <p className="t-label mb-6 mt-10 text-faint md:mt-14">{callouts.note}</p>
        <CalloutList items={callouts.items} href={callouts.more.href} />
        <Link
          href={callouts.more.href}
          className="t-label mt-10 inline-flex min-h-11 items-center gap-1.5 text-fg transition-colors hover:text-signal"
        >
          {callouts.more.label}{' '}
          <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2} />
        </Link>
      </div>
    </section>
  );
}
