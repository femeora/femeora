import { Reveal } from '@/components/ui/Reveal';
import { band, chartMarkers } from '@/content/landing';

import { MarketChart } from './MarketChart';

/** Full-bleed visual break: the pool chart with its callout layer. */
export function ChartBand() {
  return (
    <figure className="border-y border-line bg-panel">
      <Reveal className="wrap py-8 md:py-12">
        <MarketChart markers={chartMarkers} focus={4} title={band.caption} />
      </Reveal>
      <figcaption className="wrap t-label border-t border-line py-4 text-muted">
        {band.caption}
      </figcaption>
    </figure>
  );
}
