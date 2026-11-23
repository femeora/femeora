import { randomBytes, randomUUID } from 'node:crypto';

import cookie from '@fastify/cookie';
import { getFomeoraDeployment, swapRouterAbi } from '@fomeora/contracts-sdk';
import Fastify from 'fastify';
import { decodeFunctionData, parseAbi, type Address } from 'viem';

process.env.NODE_ENV = 'test';
const { loadApiEnvironment } = await import('@fomeora/env');
const environment = loadApiEnvironment();
const { prisma } = await import('@fomeora/database');
const { createSession, SESSION_COOKIE_NAME } = await import('../src/core/auth/session.js');
const { registerSwapRoutes } = await import('../src/routes/swaps.js');

const address = () => `0x${randomBytes(20).toString('hex')}` as Address;
const poolAddress = address();
const token0 = address();
const token1 = address();
const walletAddress = address();
const unlinkedWallet = address();
const userXId = `verify-swap-${randomUUID()}`;
const erc20Abi = parseAbi(['function approve(address spender, uint256 amount) returns (bool)']);
let poolId = '';
let userId = '';

const fakeClient = {
  readContract: async (input: { functionName: string }) => {
    if (input.functionName === 'currentFeePips') return 0;
    if (input.functionName === 'allowance') return 0n;
    throw new Error('UNEXPECTED_READ');
  },
  estimateGas: async () => 50_000n,
};

const app = Fastify();
await app.register(cookie);
await registerSwapRoutes(
  app,
  environment.CHAIN_ID,
  fakeClient as never,
  async () => 123n,
);

try {
  const user = await prisma.user.create({
    data: {
      xId: userXId,
      handle: `verify_swap_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      wallets: { create: { address: walletAddress.toLowerCase() } },
    },
    select: { id: true },
  });
  userId = user.id;
  const pool = await prisma.pool.create({
    data: {
      chainId: environment.CHAIN_ID,
      address: poolAddress.toLowerCase(),
      type: 'DLMM',
      tokenX: token0.toLowerCase(),
      tokenY: token1.toLowerCase(),
      tokenXDecimals: 0,
      tokenYDecimals: 0,
      quoteToken: token1.toLowerCase(),
      binStep: 100,
      baseFeePips: 0,
      initialActiveBin: 0,
      activeBin: 0,
      createdBlock: 100n,
      bins: {
        create: [
          { binId: 0, reserveX: '0', reserveY: '1000', totalShares: '1000', updatedBlock: 123n },
          { binId: -1, reserveX: '0', reserveY: '1000', totalShares: '1000', updatedBlock: 123n },
        ],
      },
    },
    select: { id: true },
  });
  poolId = pool.id;
  const session = await createSession(user.id);
  const headers = {
    cookie: `${SESSION_COOKIE_NAME}=${session}`,
    'content-type': 'application/json',
  };
  const body = {
    tokenIn: token0,
    amountIn: '1500',
    slippageBps: 50,
    maximumBinCrossings: 2,
  };
  const quote = await app.inject({
    method: 'POST',
    url: `/v1/pools/${poolAddress}/swap-quote`,
    headers,
    payload: body,
  });
  const prepare = await app.inject({
    method: 'POST',
    url: `/v1/pools/${poolAddress}/swap-prepare`,
    headers,
    payload: { ...body, walletAddress },
  });
  const denied = await app.inject({
    method: 'POST',
    url: `/v1/pools/${poolAddress}/swap-prepare`,
    headers,
    payload: { ...body, walletAddress: unlinkedWallet },
  });
  const quoteJson = quote.json();
  const prepared = prepare.json();
  const approvalDecoded = decodeFunctionData({ abi: erc20Abi, data: prepared.approval.data });
  const swapDecoded = decodeFunctionData({ abi: swapRouterAbi, data: prepared.swap.data });
  const deployment = getFomeoraDeployment(environment.CHAIN_ID);
  const result = {
    canonicalQuoteReturned: quote.statusCode === 200 && quoteJson.amountOutRaw === '1495',
    slippageApplied: quoteJson.minimumAmountOutRaw === '1487',
    safeBlockBound: quoteJson.blockNumber === '123',
    linkedWalletRequired: denied.statusCode === 403,
    exactApprovalPrepared: prepare.statusCode === 200
      && approvalDecoded.functionName === 'approve'
      && approvalDecoded.args[0].toLowerCase() === deployment.swapRouter.toLowerCase()
      && approvalDecoded.args[1] === 1_500n,
    routerSwapPrepared: swapDecoded.functionName === 'swapDlmmExactInput'
      && prepared.swap.to.toLowerCase() === deployment.swapRouter.toLowerCase(),
    gasEstimated: prepared.approval.gas === '0xc350',
  };
  console.log(JSON.stringify(result));
  if (Object.values(result).some(value => !value)) throw new Error('SWAP_ACCEPTANCE_FAILED');
} catch {
  console.error(JSON.stringify({ error: 'SWAP_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  if (poolId) await prisma.pool.deleteMany({ where: { id: poolId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  await app.close();
  await prisma.$disconnect();
}
