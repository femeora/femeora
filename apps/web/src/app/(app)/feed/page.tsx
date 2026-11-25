import type { Metadata } from 'next';
import { Suspense } from 'react';

import { FeedScreen } from '@/features/feed/components/FeedScreen';

export const metadata: Metadata = {
  title: 'Feed · Femeora',
  description: 'Live LP callouts, proof-backed and ready to tail.',
};

export default function FeedPage() {
  return (
    <Suspense fallback={<FeedLoading />}>
      <FeedScreen />
    </Suspense>
  );
}

function FeedLoading() {
  return (
    <section className="px-gutter py-8">
      <div className="glass min-h-64 animate-pulse rounded-[2px]" aria-label="Loading feed" />
    </section>
  );
}
