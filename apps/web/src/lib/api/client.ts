import type { ZodType } from 'zod';

export class BrowserApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'BrowserApiError';
  }
}

/** Browser requests remain same-origin; Railway API hostnames never enter this module or bundle. */
export async function browserApiRequest<T>(
  path: string,
  schema: ZodType<T>,
  options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  if (!path.startsWith('/v1/')) throw new BrowserApiError(400, 'INVALID_API_PATH');
  const method = options.method ?? 'GET';
  const mutation = method !== 'GET';
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(mutation ? { 'content-type': 'application/json' } : {}),
    },
    ...(mutation ? { body: JSON.stringify(options.body ?? {}) } : {}),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new BrowserApiError(response.status, payload?.error ?? 'API_REQUEST_FAILED');
  }
  const payload: unknown = response.status === 204 ? undefined : await response.json().catch(() => {
    throw new BrowserApiError(502, 'INVALID_API_RESPONSE');
  });
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new BrowserApiError(502, 'INVALID_API_RESPONSE');
  return parsed.data;
}
