import { ScrollWords } from '@/components/motion/ScrollWords';
import { Reveal } from '@/components/ui/Reveal';
import { statement } from '@/content/landing';

import { ProofFigure } from './ProofFigure';

/**
 * Light "chapter" break: the product thesis, lit word by word as it scrolls in,
 * then drawn: a screenshot of a range against a callout bound to chain.
 */
export function Statement() {
  return (
    <section aria-labelledby="statement-title" className="theme-light section">
      <div className="wrap grid-12 gap-y-8">
        <h2 id="statement-title" className="col-span-12 text-h1 font-medium md:col-span-8">
          <ScrollWords text={statement.title} />
        </h2>
        <Reveal delay={80} className="col-span-12 md:col-span-4 md:col-start-9">
          <p className="max-w-[34em] text-muted">{statement.body}</p>
        </Reveal>
        <div className="col-span-12 mt-8 md:mt-16">
          <ProofFigure />
        </div>
      </div>
    </section>
  );
}
