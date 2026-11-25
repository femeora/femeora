import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LaunchpadSurface } from '@/features/launch/components/LaunchpadSurface';
import { getLaunchpad } from '@/lib/api/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const launchpad = await getLaunchpad(params.slug).catch(() => null);
  return launchpad
    ? {
        title: `${launchpad.name} · Femeora`,
        description: `Launches and curve activity from ${launchpad.name}.`,
      }
    : { title: 'Launchpad · Femeora' };
}

export default async function LaunchpadPage({ params }: { params: { slug: string } }) {
  const pad = await getLaunchpad(params.slug).catch(() => null);
  if (!pad) notFound();
  return <LaunchpadSurface initial={pad} />;
}
