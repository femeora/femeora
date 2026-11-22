import { ButtonLink } from '@/components/ui/ButtonLink';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHead } from '@/components/ui/SectionHead';
import { appPreview } from '@/content/landing';

import { AppPreview } from './AppPreview';
import { SystemDiagram } from './SystemDiagram';

/** Shows the product itself: the live terminal in a frame, then how the system fits together. */
export function AppSection() {
  return (
    <section id="app" aria-labelledby="app-title" className="section-tight">
      <div className="wrap">
        <SectionHead
          id="app-title"
          cue={appPreview.cue}
          label={appPreview.label}
          title={appPreview.title}
        />

        <div className="grid-12 mt-10 gap-y-6 md:mt-14">
          <Reveal className="col-span-12 md:col-span-6">
            <p className="max-w-[36em] text-muted">{appPreview.body}</p>
          </Reveal>
          <Reveal delay={60} className="col-span-12 md:col-span-6 md:justify-self-end md:self-end">
            <ButtonLink href={appPreview.cta.href} variant="primary">
              {appPreview.cta.label}
            </ButtonLink>
          </Reveal>
        </div>

        <Reveal className="mt-8 md:mt-10">
          <AppPreview frameUrl={appPreview.frameUrl} />
        </Reveal>

        <Reveal className="mt-14 md:mt-20">
          <SystemDiagram title={appPreview.systemTitle} nodes={appPreview.system} />
        </Reveal>
      </div>
    </section>
  );
}
