process.env.NODE_ENV = 'test';

const { loadApiEnvironment } = await import('@fomeora/env');
const environment = loadApiEnvironment();
const { prisma } = await import('@fomeora/database');
const { SESSION_COOKIE_NAME } = await import('../src/core/auth/session.js');
const { createServer } = await import('../src/index.js');

const xId = `verify-x-${Date.now()}`;
const handle = `verify_x_${Date.now().toString().slice(-8)}`;
const originalFetch = globalThis.fetch;
let tokenVerifier = '';
let tokenAuthorization = '';
let createdStateHash = '';

globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url === 'https://api.x.com/2/oauth2/token') {
    tokenVerifier = new URLSearchParams(String(init?.body)).get('code_verifier') ?? '';
    tokenAuthorization = new Headers(init?.headers).get('authorization') ?? '';
    return Response.json({ access_token: 'acceptance-access-token' });
  }
  if (url.startsWith('https://api.x.com/2/users/me')) {
    return Response.json({
      data: {
        id: xId,
        username: handle,
        name: 'Acceptance User',
        profile_image_url: 'https://pbs.twimg.com/profile_images/acceptance.jpg',
        verified: true,
        public_metrics: { followers_count: 42 },
      },
    });
  }
  throw new Error('UNEXPECTED_OUTBOUND_REQUEST');
};

const app = await createServer({
  ...environment,
  X_CLIENT_ID: 'acceptance-client-id',
  X_CLIENT_SECRET: 'acceptance-client-secret',
});

function cookies(response: { headers: Record<string, string | string[] | undefined> }): string[] {
  const value = response.headers['set-cookie'];
  return Array.isArray(value) ? value : value ? [value] : [];
}

function cookieValue(headers: string[], name: string): string {
  const match = headers.join('\n').match(new RegExp(`(?:^|\\n)${name}=([^;]+)`));
  if (!match?.[1]) throw new Error(`MISSING_${name.toUpperCase()}_COOKIE`);
  return match[1];
}

try {
  await app.ready();
  const start = await app.inject({
    method: 'GET',
    url: '/v1/auth/x/start?redirect=%2Ffeed',
  });
  const authorize = new URL(start.headers.location ?? '');
  const state = authorize.searchParams.get('state') ?? '';
  const verifier = cookieValue(cookies(start), 'fomeora_x_oauth');
  createdStateHash = (await import('../src/core/security/tokens.js')).hashOpaqueToken(state);
  const storedState = await prisma.oAuthState.findUnique({
    where: { stateHash: createdStateHash },
  });

  const callback = await app.inject({
    method: 'GET',
    url: `/v1/auth/x/callback?code=acceptance-code&state=${encodeURIComponent(state)}`,
    headers: { cookie: `fomeora_x_oauth=${verifier}` },
  });
  const session = cookieValue(cookies(callback), SESSION_COOKIE_NAME);
  const me = await app.inject({
    method: 'GET',
    url: '/v1/me',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${session}` },
  });
  const replay = await app.inject({
    method: 'GET',
    url: `/v1/auth/x/callback?code=replay&state=${encodeURIComponent(state)}`,
    headers: { cookie: `fomeora_x_oauth=${verifier}` },
  });

  const result = {
    redirectsToOfficialX: start.statusCode === 302 && authorize.origin === 'https://x.com',
    readOnlyScope: authorize.searchParams.get('scope') === 'tweet.read users.read',
    pkceS256: authorize.searchParams.get('code_challenge_method') === 'S256',
    stateStoredOnlyAsHash: Boolean(storedState) && storedState?.stateHash !== state,
    verifierBoundToTokenExchange: tokenVerifier === verifier,
    confidentialClientAuthentication: tokenAuthorization.startsWith('Basic '),
    callbackReturnsToSafePath: callback.statusCode === 302 && callback.headers.location === `${environment.WEB_BASE_URL}/feed`,
    httpOnlySessionIssued: cookies(callback).some(cookie => cookie.startsWith(`${SESSION_COOKIE_NAME}=`) && cookie.includes('HttpOnly')),
    meUsesServerSession: me.statusCode === 200 && me.json().handle === handle && me.json().wallets.length === 0,
    profileSnapshotStored:
      (await prisma.user.findUnique({ where: { xId }, select: { xFollowers: true } }))?.xFollowers === 42,
    stateReplayDenied: replay.statusCode === 302 && replay.headers.location?.includes('X_AUTH_STATE_INVALID') === true,
  };
  console.log(JSON.stringify(result));
  if (Object.values(result).some(value => !value)) throw new Error('X_AUTH_ACCEPTANCE_FAILED');
} catch {
  console.error(JSON.stringify({ error: 'X_AUTH_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
  await prisma.user.deleteMany({ where: { xId } });
  if (createdStateHash) await prisma.oAuthState.deleteMany({ where: { stateHash: createdStateHash } });
  await app.close();
  await prisma.$disconnect();
}
