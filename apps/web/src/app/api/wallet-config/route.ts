import { loadWebEnvironment } from '@fomeora/env';
import { NextResponse } from 'next/server';

const PUBLIC_WALLET_RPCS = {
  mainnet: 'https://robinhood.drpc.org',
  testnet: 'https://rpc.testnet.chain.robinhood.com',
} as const;

export const dynamic = 'force-dynamic';

export function GET() {
  const environment = loadWebEnvironment();
  return NextResponse.json(
    {
      projectId: environment.WALLETCONNECT_PROJECTID ?? null,
      rpcUrl: PUBLIC_WALLET_RPCS[environment.APP_NETWORK],
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
