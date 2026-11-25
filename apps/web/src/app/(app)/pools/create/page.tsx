import type { Metadata } from 'next';

import { CreatePoolForm } from '@/features/pool/components/CreatePoolForm';

export const metadata: Metadata = { title: 'Create pool · Femeora' };

const addressPattern = /^0x[a-fA-F0-9]{40}$/;

export default function CreatePoolPage({ searchParams }: { searchParams?: { tokenA?: string; tokenB?: string } }) {
  const initialTokenA = searchParams?.tokenA && addressPattern.test(searchParams.tokenA) ? searchParams.tokenA : '';
  const initialTokenB = searchParams?.tokenB && addressPattern.test(searchParams.tokenB) ? searchParams.tokenB : '';
  return <section className="px-gutter py-8"><header className="mb-6 border-b border-line pb-5"><p className="t-label text-signal">Permissionless factory</p><h1 className="mt-2 text-3xl font-medium tracking-tight">Create liquidity pool</h1><p className="mt-2 max-w-2xl text-muted">Create a canonical DAMM or DLMM pool directly from your wallet. No deployer, admin approval, or X account is required.</p></header><CreatePoolForm initialTokenA={initialTokenA} initialTokenB={initialTokenB} /></section>;
}
