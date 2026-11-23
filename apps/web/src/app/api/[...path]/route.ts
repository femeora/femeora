import { loadWebEnvironment } from '@fomeora/env';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 15_000;
const SEGMENT = /^[A-Za-z0-9._~-]+$/;
const FORWARDED_REQUEST_HEADERS = ['accept', 'content-type', 'cookie', 'last-event-id'] as const;
const FORWARDED_RESPONSE_HEADERS = [
  'cache-control',
  'content-type',
  'etag',
  'last-modified',
  'location',
  'retry-after',
] as const;

function safePath(segments: readonly string[]): string | null {
  if (segments.length === 0 || segments.length > 12) return null;
  if (segments.some(segment => !SEGMENT.test(segment) || segment === '.' || segment === '..')) {
    return null;
  }
  return `/${segments.join('/')}`;
}

function error(status: number, code: string) {
  return NextResponse.json({ error: code }, { status, headers: { 'cache-control': 'no-store' } });
}

function selectHeaders(source: Headers, names: readonly string[]): Headers {
  const selected = new Headers();
  for (const name of names) {
    const value = source.get(name);
    if (value) selected.set(name, value);
  }
  return selected;
}

function selectResponseHeaders(source: Headers): Headers {
  const selected = selectHeaders(source, FORWARDED_RESPONSE_HEADERS);
  const cookieHeaders = (source as Headers & { getSetCookie?: () => string[] }).getSetCookie?.()
    ?? (source.get('set-cookie') ? [source.get('set-cookie') as string] : []);
  for (const cookie of cookieHeaders) selected.append('set-cookie', cookie);
  return selected;
}

function rewriteLocation(headers: Headers, target: URL, apiBaseUrl: string): void {
  const location = headers.get('location');
  if (!location) return;
  try {
    const destination = new URL(location, target);
    if (destination.origin === new URL(apiBaseUrl).origin) {
      headers.set('location', `/api${destination.pathname}${destination.search}`);
    }
  } catch {
    headers.delete('location');
  }
}

async function proxy(
  request: NextRequest,
  context: { params: { path: string[] } },
): Promise<Response> {
  const path = safePath(context.params.path);
  if (!path || (!path.startsWith('/v1/') && path !== '/health')) {
    return error(404, 'API_ROUTE_NOT_FOUND');
  }
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_BODY_BYTES) {
    return error(413, 'REQUEST_TOO_LARGE');
  }

  const { API_BASE_URL } = loadWebEnvironment();
  const target = new URL(path, API_BASE_URL);
  target.search = request.nextUrl.search;
  const headers = selectHeaders(request.headers, FORWARDED_REQUEST_HEADERS);
  let body: ArrayBuffer | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return error(413, 'REQUEST_TOO_LARGE');
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      ...(body ? { body } : {}),
      redirect: 'manual',
      cache: 'no-store',
      // SSE streams must remain open; finite requests still fail closed.
      ...(path.endsWith('/stream') ? {} : { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
    });
  } catch {
    return error(502, 'API_UPSTREAM_UNAVAILABLE');
  }

  const responseHeaders = selectResponseHeaders(upstream.headers);
  rewriteLocation(responseHeaders, target, API_BASE_URL);
  responseHeaders.set('cache-control', 'no-store');
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
