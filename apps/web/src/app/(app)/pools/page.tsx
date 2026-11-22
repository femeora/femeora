import type { Metadata } from 'next';

import { PoolTerminal } from '@/features/pool/components/PoolTerminal';

export const metadata: Metadata = {
  title: 'HOODIE / USDG pool · Fomeora',
  description: 'Create a DLMM position, post it as a callout, or swap.',
};

export default function PoolPage() {
  return <PoolTerminal />;
}
