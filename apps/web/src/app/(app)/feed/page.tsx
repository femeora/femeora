import type { Metadata } from 'next';

import { FeedScreen } from '@/features/feed/components/FeedScreen';

export const metadata: Metadata = {
  title: 'Feed · Femeora',
  description: 'Live LP callouts, proof-backed and ready to tail.',
};

export default function FeedPage() {
  return <FeedScreen />;
}
