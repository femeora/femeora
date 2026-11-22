import { Reveal } from '@/components/ui/Reveal';
import { statement } from '@/content/landing';

/** Light "chapter" break: the product thesis in one sentence. */
export function Statement() {
  return (
    <section aria-labelledby="statement-title" className="theme-light section">
      <div className="wrap grid-12 gap-y-8">
        <Reveal className="col-span-12 md:col-span-7">
          <h2 id="statement-title" className="text-h2 font-medium">
            {statement.title}
          </h2>
        </Reveal>
        <Reveal delay={80} className="col-span-12 md:col-span-4 md:col-start-9">
          <p className="max-w-[34em] text-muted">{statement.body}</p>
        </Reveal>
      </div>
    </section>
  );
}
