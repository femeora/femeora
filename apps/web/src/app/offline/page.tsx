import { BrandMark, Wordmark } from '@/components/ui/BrandMark';
import { ButtonLink } from '@/components/ui/ButtonLink';

export default function OfflinePage() {
  return (
    <main className="mx-auto grid min-h-[70dvh] max-w-2xl place-items-center px-gutter py-section">
      <section className="glass-raised w-full rounded-[2px] p-8 text-center">
        <div className="flex items-center justify-center gap-3">
          <BrandMark />
          <Wordmark />
        </div>
        <p className="t-label mt-8 text-muted">Connection unavailable</p>
        <h1 className="mt-3 text-3xl">Femeora is offline.</h1>
        <p className="mx-auto mt-4 max-w-lg text-muted">
          Reconnect before loading live market data, signing wallet requests, or sending a
          transaction. Femeora never substitutes cached values for live transaction data.
        </p>
        <ButtonLink href="/feed" variant="primary" className="mt-8">
          Try again
        </ButtonLink>
      </section>
    </main>
  );
}
