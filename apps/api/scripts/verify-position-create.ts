import { randomBytes, randomUUID } from 'node:crypto';

import cookie from '@fastify/cookie';
import { getFomeoraDeployment, positionManagerV2Abi } from '@fomeora/contracts-sdk';
import Fastify from 'fastify';
import { decodeFunctionData, parseAbi, type Address } from 'viem';

process.env.NODE_ENV = 'test';
// The verifier never starts a public server; a valid local origin keeps deployment placeholders out of acceptance.
process.env.WEB_BASE_URL = 'http://127.0.0.1:3000';
const { loadApiEnvironment } = await import('@fomeora/env');
const environment = loadApiEnvironment();
const { prisma } = await import('@fomeora/database');
const { createSession, SESSION_COOKIE_NAME } = await import('../src/core/auth/session.js');
const { registerPositionCreateRoutes } = await import('../src/routes/position-create.js');

const address = () => `0x${randomBytes(20).toString('hex')}` as Address;
const poolAddress = address();
const token0 = address();
const token1 = address();
const walletAddress = address();
const unlinkedWallet = address();
const tag = `0x${randomBytes(32).toString('hex')}`;
const erc20Abi = parseAbi(['function approve(address spender, uint256 amount) returns (bool)']);
let poolId = '';
let userId = '';

const fakeClient = {
  readContract: async (input: { functionName: string }) => {
    if (input.functionName === 'activeBin') return 0;
    if (input.functionName === 'binState') return [0n, 0n, 0n, 10n ** 18n];
    if (input.functionName === 'allowance') return 0n;
    throw new Error('UNEXPECTED_READ');
  },
  estimateGas: async () => 50_000n,
};

const app = Fastify();
await app.register(cookie);
await registerPositionCreateRoutes(app, environment.CHAIN_ID, fakeClient as never, async () => 123n);

try {
  const user = await prisma.user.create({
    data: {
      xId: `verify-position-${randomUUID()}`,
      handle: `verify_pos_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      wallets: { create: { address: walletAddress.toLowerCase() } },
    },
    select: { id: true },
  });
  userId = user.id;
  const pool = await prisma.pool.create({
    data: {
      chainId: environment.CHAIN_ID, address: poolAddress.toLowerCase(), type: 'DLMM',
      tokenX: token0.toLowerCase(), tokenY: token1.toLowerCase(), tokenXDecimals: 0, tokenYDecimals: 0,
      quoteToken: token1.toLowerCase(), binStep: 100, baseFeePips: 0,
      initialActiveBin: 0, activeBin: 0, createdBlock: 100n,
    },
    select: { id: true },
  });
  poolId = pool.id;
  const intent = await prisma.calloutIntent.create({
    data: {
      userId, chainId: environment.CHAIN_ID, poolId, tag, caption: 'Controlled position acceptance',
      showSize: false, expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
  const session = await createSession(user.id);
  const headers = { cookie: `${SESSION_COOKIE_NAME}=${session}`, 'content-type': 'application/json' };
  const body = { shape: 'spot', minPct: -1, maxPct: 1, amountX: '3000', amountY: '2000', slippageBps: 50 };
  const quoteResponse = await app.inject({ method: 'POST', url: `/v1/pools/${poolAddress}/position-quote`, headers, payload: body });
  const prepareResponse = await app.inject({
    method: 'POST', url: `/v1/pools/${poolAddress}/position-prepare`, headers,
    payload: { ...body, walletAddress, intentId: intent.id },
  });
  const denied = await app.inject({
    method: 'POST', url: `/v1/pools/${poolAddress}/position-prepare`, headers,
    payload: { ...body, walletAddress: unlinkedWallet, intentId: intent.id },
  });
  const quote = quoteResponse.json();
  const prepared = prepareResponse.json();
  const deployment = getFomeoraDeployment(environment.CHAIN_ID);
  const approvals = prepared.approvals.map((approval: { data: `0x${string}` }) =>
    decodeFunctionData({ abi: erc20Abi, data: approval.data }));
  const create = decodeFunctionData({ abi: positionManagerV2Abi, data: prepared.create.data });
  const params = create.args[0];
  const storedIntent = await prisma.calloutIntent.findUniqueOrThrow({ where: { id: intent.id } });
  const result = {
    canonicalQuoteReturned: quoteResponse.statusCode === 200 && quote.blockNumber === '123',
    exactBinAllocation: JSON.stringify(quote.bins) === '[-1,0,1]'
      && quote.amountsXRaw.join(',') === '0,1500,1500'
      && quote.amountsYRaw.join(',') === '2000,0,0',
    linkedWalletRequired: denied.statusCode === 403,
    exactApprovalsPrepared: prepareResponse.statusCode === 200 && approvals.length === 2
      && approvals.every((approval: { functionName: string; args: readonly unknown[] }) =>
        approval.functionName === 'approve' && String(approval.args[0]).toLowerCase() === deployment.positionManagerV2.toLowerCase()),
    positionManagerPrepared: create.functionName === 'createRangePosition'
      && prepared.create.to.toLowerCase() === deployment.positionManagerV2.toLowerCase(),
    intentTagBound: params.tag.toLowerCase() === tag.toLowerCase(),
    shapeAndActiveBinBound: params.shape === 0 && params.expectedActiveBin === 0,
    showSizePersisted: storedIntent.showSize === false,
    gasEstimated: prepared.approvals.every((approval: { gas?: string }) => approval.gas === '0xc350'),
  };
  console.log(JSON.stringify(result));
  if (Object.values(result).some(value => !value)) throw new Error('POSITION_ACCEPTANCE_FAILED');
} catch {
  console.error(JSON.stringify({ error: 'POSITION_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  if (poolId) await prisma.pool.deleteMany({ where: { id: poolId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  await app.close();
  await prisma.$disconnect();
}
