import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CurveTerminal } from '@/features/launch/components/CurveTerminal';
import { getLaunch, getPoolAssets } from '@/lib/api/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const launch = await getLaunch(params.token).catch(() => null);
  return launch ? { title: `${launch.symbol} launch · Femeora`, description: `${launch.name} bonding curve and graduation progress.` } : { title: 'Token launch · Femeora' };
}

export default async function TokenLaunchPage({ params }: { params: { token: string } }) {
  const [launch, assets] = await Promise.all([
    getLaunch(params.token).catch(() => null),
    getPoolAssets().then(result => result.data).catch(() => []),
  ]);
  if (!launch) notFound();
  const quote = assets.find(
    asset => asset.address.toLowerCase() === launch.launchpad.quoteToken.toLowerCase()
  );
  return (
    <CurveTerminal
      initial={launch}
      initialQuote={{
        symbol: quote?.symbol ?? 'QUOTE',
        name: quote?.name ?? 'Quote token',
        decimals: quote?.decimals ?? 18,
        logoUrl: quote?.logoUrl ?? null,
      }}
    />
  );
}

