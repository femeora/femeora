import { ButtonLink } from '@/components/ui/ButtonLink';
import { Reveal } from '@/components/ui/Reveal';
import { cta } from '@/content/landing';

export function CtaSection() {
  return (
    <section aria-labelledby="cta-title" className="section border-t border-line">
      <div className="wrap grid-12 gap-y-8">
        <Reveal className="col-span-12 md:col-span-8">
          <h2 id="cta-title" className="text-h2 font-medium">
            {cta.title}
          </h2>
        </Reveal>
        <Reveal delay={80} className="col-span-12 grid content-end gap-6 md:col-span-4">
          <p className="text-muted">{cta.body}</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={cta.primary.href} variant="primary">
              {cta.primary.label}
            </ButtonLink>
            <ButtonLink href={cta.secondary.href}>{cta.secondary.label}</ButtonLink>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
