'use client';

import { ApiIndexedPositionListSchema } from '@fomeora/types';

import { useWallet } from '@/features/wallet/store';
import { useApiResource } from '@/lib/api/useApiResource';

export function usePositions() {
  const wallet = useWallet(state => state.account);
  return useApiResource(
    wallet ? `/v1/positions?owner=${encodeURIComponent(wallet)}` : null,
    ApiIndexedPositionListSchema,
  );
}
