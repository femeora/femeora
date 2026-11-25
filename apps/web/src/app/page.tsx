import { loadWebEnvironment } from '@fomeora/env';

import { AppSection } from '@/components/landing/AppSection';
import { CalloutsSection } from '@/components/landing/CalloutsSection';
import { CtaSection } from '@/components/landing/CtaSection';
import { Hero } from '@/components/landing/Hero';
import { IntegritySection } from '@/components/landing/IntegritySection';
import { LoopSection } from '@/components/landing/LoopSection';
import { Marquee } from '@/components/landing/Marquee';
import { SafetySection } from '@/components/landing/SafetySection';
import { SiteHeader } from '@/components/landing/SiteHeader';
import { Statement } from '@/components/landing/Statement';
import { Ambient } from '@/components/ui/Ambient';
import { Grain } from '@/components/ui/Grain';
import { marquee } from '@/content/landing';

export default function LandingPage() {
  const { APP_NETWORK: network, HERO_CA_ADDRESS: contractAddress } = loadWebEnvironment();

  return (
    <>
      <a
        href="#main"
        className="t-label sr-only z-[90] bg-fg px-4 py-3 text-bg focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <Ambient />
      <SiteHeader network={network} />
      <main id="main" className="pt-header">
        <Hero network={network} contractAddress={contractAddress} />
        <Statement />
        <AppSection />
        <CalloutsSection />
        <LoopSection />
        <Marquee items={marquee} label="Shapes and presets" />
        <IntegritySection />
        <SafetySection />
        <CtaSection />
      </main>
      <Grain />
    </>
  );
}
