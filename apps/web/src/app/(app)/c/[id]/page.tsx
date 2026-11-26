import { loadWebEnvironment } from '@fomeora/env';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CalloutPost } from '@/features/callouts/components/CalloutPost';
import { apiFeedCalloutToCallout } from '@/features/callouts/model/fromApi';
import { FomeoraApiError, getCallout, getPoolAssets } from '@/lib/api/server';

interface CalloutPageProps {
  params: { id: string };
}

async function loadPublicCallout(id: string) {
  try {
    const [apiCallout, assetResponse] = await Promise.all([
      getCallout(id),
      getPoolAssets().catch(() => ({ data: [] })),
    ]);
    const assets = new Map(assetResponse.data.map(asset => [asset.address.toLowerCase(), asset]));
    return apiFeedCalloutToCallout(apiCallout, new Date(), assets);
  } catch (error) {
    if (error instanceof FomeoraApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: CalloutPageProps): Promise<Metadata> {
  const callout = await loadPublicCallout(params.id);
  const { WEB_BASE_URL } = loadWebEnvironment();
  const title = `@${callout.caller.handle} · ${callout.pool.base}/${callout.pool.quote} callout`;
  const description = callout.caption ?? `${callout.pool.type} liquidity range on Femeora.`;
  const canonical = new URL(`/c/${callout.id}`, WEB_BASE_URL);
  const image = new URL(`/c/${callout.id}/opengraph-image`, WEB_BASE_URL);
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'article',
      url: canonical,
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default async function CalloutPage({ params }: CalloutPageProps) {
  const callout = await loadPublicCallout(params.id);
  return (
    <main className="mx-auto min-h-[70vh] w-full max-w-3xl border-x border-line">
      <header className="border-b border-line px-gutter py-6">
        <p className="t-label text-signal">Proof-backed callout</p>
        <h1 className="mt-2 text-2xl font-medium tracking-tight">
          {callout.pool.base} / {callout.pool.quote}
        </h1>
        <p className="mt-2 text-sm text-muted">
          A public liquidity position verified from Robinhood Chain activity.
        </p>
      </header>
      <CalloutPost callout={callout} />
    </main>
  );
}
