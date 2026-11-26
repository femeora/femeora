import type { Metadata } from 'next';

import { PublicDocs } from '@/features/docs/PublicDocs';

export const metadata: Metadata = {
  title: 'Documentation · Femeora',
  description:
    'User guides, safety, public terms, privacy and verified Femeora contracts on Robinhood Chain Mainnet.',
};

export default function DocumentationPage() {
  return <PublicDocs />;
}
