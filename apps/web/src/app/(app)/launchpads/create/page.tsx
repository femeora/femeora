import type { Metadata } from 'next';

import { LaunchpadWizard } from '@/features/launch/components/LaunchpadWizard';

export const metadata: Metadata = { title: 'Create launchpad · Femeora' };

export default function CreateLaunchpadPage() {
  return <section className="px-gutter py-8"><header className="mb-6 border-b border-line pb-5"><p className="t-label text-signal">Four-step factory</p><h1 className="mt-2 text-3xl font-medium tracking-tight">Create a launchpad</h1><p className="mt-2 max-w-2xl text-muted">Define the identity, owner, curve economics, graduation schedule, and protected-launch rules. Deployment is one wallet transaction.</p></header><LaunchpadWizard /></section>;
}

