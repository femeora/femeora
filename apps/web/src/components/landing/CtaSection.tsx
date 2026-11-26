import { ScrollScene } from '@/components/motion/ScrollScene';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { cta } from '@/content/landing';

import { LiquidityField } from './LiquidityField';

/**
 * Closing chapter: the interactive WebGL liquidity field fills the section and
 * the call to action sits on a liquid-glass plate above it.
 */
export function CtaSection() {
  return (
    <section
      aria-labelledby="cta-title"
      className="relative isolate flex min-h-[92svh] items-end overflow-hidden border-t border-line"
    >
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <LiquidityField className="absolute inset-0 size-full" />
        <div className="absolute inset-0 bg-gradient-to-b from-bg via-bg/10 to-bg/80" />
      </div>

      <div className="wrap grid-12 gap-y-8 pb-[clamp(3rem,8vw,6rem)] pt-40">
        <ScrollScene start={1} end={0.45} className="scroll-scale col-span-12 md:col-span-8">
          <h2 id="cta-title" className="text-metal text-h1 font-medium">
            {cta.title}
          </h2>
        </ScrollScene>
        <LiquidGlass className="col-span-12 grid content-end gap-6 self-end p-6 md:col-span-4 md:p-7">
          <p className="text-muted">{cta.body}</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={cta.primary.href} variant="primary">
              {cta.primary.label}
            </ButtonLink>
            <ButtonLink href={cta.secondary.href}>{cta.secondary.label}</ButtonLink>
          </div>
        </LiquidGlass>
      </div>
    </section>
  );
}
