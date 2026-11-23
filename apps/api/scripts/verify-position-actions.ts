import { randomBytes, randomUUID } from 'node:crypto';

import cookie from '@fastify/cookie';
import { getFomeoraDeployment, positionManagerV2Abi } from '@fomeora/contracts-sdk';
import Fastify from 'fastify';
import { decodeFunctionData, parseAbi, type Address } from 'viem';

process.env.NODE_ENV = 'test';
process.env.WEB_BASE_URL = 'http://127.0.0.1:3000';
const { loadApiEnvironment } = await import('@fomeora/env');
const environment = loadApiEnvironment();
const { prisma } = await import('@fomeora/database');
const { createSession, SESSION_COOKIE_NAME } = await import('../src/core/auth/session.js');
const { registerPositionActionRoutes } = await import('../src/routes/position-actions.js');

const address = () => `0x${randomBytes(20).toString('hex')}` as Address;
const poolAddress = address();
const token0 = address();
const token1 = address();
const walletAddress = address();
const unlinkedWallet = address();
const positionId = BigInt(Date.now());
const erc20Abi = parseAbi(['function approve(address spender, uint256 amount) returns (bool)']);
let poolId = '';
let userId = '';

const fakeClient = {
  readContract: async (input: { functionName: string; args?: readonly unknown[] }) => {
    if (input.functionName === 'ownerOf') return walletAddress;
    if (input.functionName === 'activeBin') return 0;
    if (input.functionName === 'allowance') return 0n;
    if (input.functionName === 'binShares') return 2_000n;
    if (input.functionName === 'binState') {
      const bin = Number(input.args?.[0]);
      return bin < 0 ? [0n, 5_000n, 5_000n, 10n ** 18n] : [5_000n, 0n, 5_000n, 10n ** 18n];
    }
    throw new Error(`UNEXPECTED_READ_${input.functionName}`);
  },
  estimateGas: async () => 50_000n,
};

const app = Fastify();
await app.register(cookie);
await registerPositionActionRoutes(app, environment.CHAIN_ID, fakeClient as never, async () => 123n);

try {
  // Recover only stale rows from an interrupted run of this exact verifier.
  const staleUsers = await prisma.user.findMany({
    where: { xId: { startsWith: 'verify-actions-' } },
    select: { id: true, wallets: { select: { address: true } } },
  });
  const staleOwners = staleUsers.flatMap(user => user.wallets.map(wallet => wallet.address));
  if (staleOwners.length > 0) {
    const stalePositions = await prisma.position.findMany({ where: { owner: { in: staleOwners } }, select: { poolId: true } });
    await prisma.position.deleteMany({ where: { owner: { in: staleOwners } } });
    await prisma.pool.deleteMany({ where: { id: { in: stalePositions.map(position => position.poolId) } } });
    await prisma.user.deleteMany({ where: { id: { in: staleUsers.map(user => user.id) } } });
  }
  const user = await prisma.user.create({
    data: { xId: `verify-actions-${randomUUID()}`, handle: `verify_act_${randomUUID().replaceAll('-', '').slice(0, 12)}`, wallets: { create: { address: walletAddress.toLowerCase() } } },
    select: { id: true },
  });
  userId = user.id;
  const pool = await prisma.pool.create({
    data: {
      chainId: environment.CHAIN_ID, address: poolAddress.toLowerCase(), type: 'DLMM', tokenX: token0.toLowerCase(), tokenY: token1.toLowerCase(),
      tokenXDecimals: 0, tokenYDecimals: 0, quoteToken: token1.toLowerCase(), binStep: 100, baseFeePips: 3_000,
      initialActiveBin: 0, activeBin: 0, createdBlock: 100n,
    }, select: { id: true },
  });
  poolId = pool.id;
  await prisma.position.create({
    data: {
      id: positionId, chainId: environment.CHAIN_ID, poolId, owner: walletAddress.toLowerCase(), lowerBin: -1, upperBin: 1,
      shape: 0, status: 'open', bins: { create: [-1, 0, 1].map(binId => ({ poolId, binId, shares: '2000' })) },
    },
  });
  const session = await createSession(user.id);
  const headers = { cookie: `${SESSION_COOKIE_NAME}=${session}`, 'content-type': 'application/json' };
  const post = (suffix: string, payload: object) => app.inject({ method: 'POST', url: `/v1/positions/${positionId}/${suffix}`, headers, payload });
  const increase = await post('increase-prepare', { walletAddress, amountX: '3000', amountY: '2000', slippageBps: 50 });
  const decrease = await post('decrease-prepare', { walletAddress, bps: 5_000, slippageBps: 50 });
  const close = await post('close-prepare', { walletAddress, slippageBps: 50 });
  const denied = await post('close-prepare', { walletAddress: unlinkedWallet, slippageBps: 50 });
  const increased = increase.json();
  const decreased = decrease.json();
  const closed = close.json();
  const increaseDecoded = decodeFunctionData({ abi: positionManagerV2Abi, data: increased.action.data });
  const decreaseDecoded = decodeFunctionData({ abi: positionManagerV2Abi, data: decreased.action.data });
  const closeDecoded = decodeFunctionData({ abi: positionManagerV2Abi, data: closed.action.data });
  const approvalDecoded = increased.approvals.map((approval: { data: `0x${string}` }) => decodeFunctionData({ abi: erc20Abi, data: approval.data }));
  const manager = getFomeoraDeployment(environment.CHAIN_ID).positionManagerV2.toLowerCase();
  const result = {
    ownershipRequired: denied.statusCode === 403,
    exactIncreaseApprovals: increase.statusCode === 200 && approvalDecoded.length === 2
      && approvalDecoded.every((decoded: { args: readonly unknown[] }) => String(decoded.args[0]).toLowerCase() === manager),
    increaseCalldataBound: increaseDecoded.functionName === 'increaseRange' && increaseDecoded.args[0] === positionId,
    decreaseQuoteExact: decreased.quote.amountXRaw === '2000' && decreased.quote.amountYRaw === '1000'
      && decreased.quote.minimumAmountXRaw === '1990' && decreased.quote.minimumAmountYRaw === '995',
    decreaseCalldataBound: decreaseDecoded.functionName === 'decreaseRange' && decreaseDecoded.args[0] === positionId && decreaseDecoded.args[1] === 5_000,
    closeQuoteExact: closed.quote.amountXRaw === '4000' && closed.quote.amountYRaw === '2000',
    closeCalldataBound: closeDecoded.functionName === 'closeRange' && closeDecoded.args[0] === positionId,
    safeBlockBound: increased.quote.blockNumber === '123' && decreased.quote.blockNumber === '123' && closed.quote.blockNumber === '123',
    actionGasEstimated: decreased.action.gas === '0xc350' && closed.action.gas === '0xc350',
  };
  console.log(JSON.stringify(result));
  if (Object.values(result).some(value => !value)) throw new Error('POSITION_ACTION_ACCEPTANCE_FAILED');
} catch {
  console.error(JSON.stringify({ error: 'POSITION_ACTION_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  await prisma.position.deleteMany({ where: { chainId: environment.CHAIN_ID, id: positionId } });
  if (poolId) await prisma.pool.deleteMany({ where: { id: poolId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  await app.close(); await prisma.$disconnect();
}
