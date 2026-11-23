'use client';

import { ApiIndexedPositionListSchema } from '@fomeora/types';

import { useSession } from '@/features/session/store';
import { useApiResource } from '@/lib/api/useApiResource';

export function usePositions() {
  const wallet = useSession(state => state.user?.wallet ?? null);
  return useApiResource(
    wallet ? `/v1/positions?owner=${encodeURIComponent(wallet)}` : null,
    ApiIndexedPositionListSchema,
  );
}
