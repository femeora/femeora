'use client';

import useSWR, { type SWRConfiguration } from 'swr';
import type { ZodType } from 'zod';

import { browserApiRequest } from './client';

/** Typed, same-origin browser cache. Passing null disables the request. */
export function useApiResource<T>(
  path: string | null,
  schema: ZodType<T>,
  config?: SWRConfiguration<T, Error>,
) {
  return useSWR<T, Error>(
    path ? ['fomeora-api', path] : null,
    ([, requestPath]: [string, string]) => browserApiRequest(requestPath, schema),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      ...config,
    },
  );
}
