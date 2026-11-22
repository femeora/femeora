import type { Metadata } from 'next';

import { PortfolioScreen } from '@/features/portfolio/components/PortfolioScreen';

export const metadata: Metadata = { title: 'Portfolio · Fomeora' };

export default function PortfolioPage() {
  return <PortfolioScreen />;
}
