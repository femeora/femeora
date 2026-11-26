import type { Metadata } from 'next';

import { CallerProfileScreen } from '@/features/profile/CallerProfileScreen';

export function generateMetadata({ params }: { params: { handle: string } }): Metadata {
  return { title: `@${params.handle.replace(/^@/, '')} · Femeora` };
}

export default function CallerProfilePage({ params }: { params: { handle: string } }) {
  return <CallerProfileScreen handle={params.handle.replace(/^@/, '')} />;
}
