import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CurveTerminal } from '@/features/launch/components/CurveTerminal';
import { getLaunch } from '@/lib/api/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const launch = await getLaunch(params.token).catch(() => null);
  return launch ? { title: `${launch.symbol} launch · Femeora`, description: `${launch.name} bonding curve and graduation progress.` } : { title: 'Token launch · Femeora' };
}

export default async function TokenLaunchPage({ params }: { params: { token: string } }) {
  const launch = await getLaunch(params.token).catch(() => null);
  if (!launch) notFound();
  return <section className="px-gutter py-8"><header className="mb-6 flex flex-wrap items-end justify-between gap-5 border-b border-line pb-5"><div className="flex items-center gap-4"><span className="flex size-14 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-panel-2 font-mono">{launch.imageUrl ? <img src={launch.imageUrl} alt={`${launch.name} logo`} referrerPolicy="no-referrer" className="size-full object-cover" /> : launch.symbol.slice(0, 2)}</span><div><p className="t-label text-signal">{launch.launchpad.name} · curve launch</p><h1 className="mt-1 text-3xl font-medium tracking-tight">{launch.name} <span className="text-muted">/ {launch.symbol}</span></h1><p className="mt-1 font-mono text-xs text-faint">{launch.token}</p></div></div><a className="t-label min-h-11 border border-line-strong px-5 py-3 text-fg" href={`/lp/${launch.launchpad.slug}`}>Open launchpad</a></header><CurveTerminal initial={launch} /></section>;
}

