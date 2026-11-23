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
const { registerTailPrepareRoutes } = await import('../src/routes/tail-prepare.js');

const address = () => `0x${randomBytes(20).toString('hex')}` as Address;
const sourceWallet = address();
const tailerWallet = address();
const unlinkedWallet = address();
const poolAddress = address();
const token0 = address();
const token1 = address();
const tag = `0x${randomBytes(32).toString('hex')}`;
const erc20Abi = parseAbi(['function approve(address spender, uint256 amount) returns (bool)']);
const userIds: string[] = [];
let poolId = '';
let positionId: bigint | null = null;
let calloutId = '';

const fakeClient = {
  readContract: async (input: { functionName: string }) => {
    if (input.functionName === 'activeBin') return 0;
    if (input.functionName === 'binState') return [0n, 0n, 0n, 10n ** 18n];
    if (input.functionName === 'allowance') return 0n;
    throw new Error(`UNEXPECTED_READ_${input.functionName}`);
  },
  estimateGas: async () => 50_000n,
};
const app = Fastify();
await app.register(cookie);
await registerTailPrepareRoutes(app, environment.CHAIN_ID, fakeClient as never, async () => 123n);

try {
  const source = await prisma.user.create({ data: { xId: `verify-tail-prepare-source-${randomUUID()}`, handle: `vtps_${randomUUID().replaceAll('-', '').slice(0, 10)}`, wallets: { create: { address: sourceWallet.toLowerCase() } } } });
  const tailer = await prisma.user.create({ data: { xId: `verify-tail-prepare-tailer-${randomUUID()}`, handle: `vtpt_${randomUUID().replaceAll('-', '').slice(0, 10)}`, wallets: { create: { address: tailerWallet.toLowerCase() } } } });
  userIds.push(source.id, tailer.id);
  const pool = await prisma.pool.create({ data: {
    chainId: environment.CHAIN_ID, address: poolAddress.toLowerCase(), type: 'DLMM', tokenX: token0.toLowerCase(), tokenY: token1.toLowerCase(),
    tokenXDecimals: 0, tokenYDecimals: 0, quoteToken: token1.toLowerCase(), binStep: 100, baseFeePips: 3_000,
    initialActiveBin: 0, activeBin: 0, createdBlock: 100n,
  } });
  poolId = pool.id;
  positionId = BigInt(`0x${randomBytes(7).toString('hex')}`);
  await prisma.position.create({ data: { chainId: environment.CHAIN_ID, id: positionId, poolId, owner: sourceWallet.toLowerCase(), lowerBin: -1, upperBin: 1, shape: 0, status: 'open' } });
  const callout = await prisma.callout.create({ data: { userId: source.id, chainId: environment.CHAIN_ID, positionId, poolId, side: 'around', shape: 0, lowerBin: -1, upperBin: 1, status: 'live' } });
  calloutId = callout.id;
  const intent = await prisma.calloutIntent.create({ data: {
    userId: tailer.id, chainId: environment.CHAIN_ID, poolId, sourceCalloutId: callout.id,
    tag, kind: 'tail', mode: 'same_range', referrer: sourceWallet.toLowerCase(), expiresAt: new Date(Date.now() + 10 * 60_000),
  } });
  const session = await createSession(tailer.id);
  const headers = { cookie: `${SESSION_COOKIE_NAME}=${session}`, 'content-type': 'application/json' };
  const payload = { mode: 'same_range', walletAddress: tailerWallet, intentId: intent.id, amountX: '3000', amountY: '2000', slippageBps: 50 };
  const response = await app.inject({ method: 'POST', url: `/v1/callouts/${callout.id}/tail-prepare`, headers, payload });
  const denied = await app.inject({ method: 'POST', url: `/v1/callouts/${callout.id}/tail-prepare`, headers, payload: { ...payload, walletAddress: unlinkedWallet } });
  const prepared = response.json();
  const decoded = decodeFunctionData({ abi: positionManagerV2Abi, data: prepared.create.data });
  const params = decoded.args[0];
  const approvals = prepared.approvals.map((approval: { data: `0x${string}` }) => decodeFunctionData({ abi: erc20Abi, data: approval.data }));
  const manager = getFomeoraDeployment(environment.CHAIN_ID).positionManagerV2.toLowerCase();
  const result = {
    linkedWalletRequired: denied.statusCode === 403,
    safeBlockBound: response.statusCode === 200 && prepared.quote.blockNumber === '123',
    exactRangeBound: prepared.quote.lowerBin === -1 && prepared.quote.upperBin === 1 && params.expectedActiveBin === 0,
    exactAllocation: params.amountsX.join(',') === '0,1500,1500' && params.amountsY.join(',') === '2000,0,0',
    exactApprovals: approvals.length === 2 && approvals.every((approval: { args: readonly unknown[] }) => String(approval.args[0]).toLowerCase() === manager),
    tagBound: params.tag.toLowerCase() === tag.toLowerCase(),
    referrerBound: params.referrer.toLowerCase() === sourceWallet.toLowerCase(),
    positionManagerBound: prepared.create.to.toLowerCase() === manager && decoded.functionName === 'createRangePosition',
    approvalGasEstimated: prepared.approvals.every((approval: { gas?: string }) => approval.gas === '0xc350'),
    noAutoExecution: (await prisma.tail.count({ where: { calloutId: callout.id } })) === 0,
  };
  console.log(JSON.stringify(result));
  if (Object.values(result).some(value => !value)) throw new Error('TAIL_PREPARE_ACCEPTANCE_FAILED');
} catch {
  console.error(JSON.stringify({ error: 'TAIL_PREPARE_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  if (calloutId) await prisma.callout.deleteMany({ where: { id: calloutId } });
  if (poolId) await prisma.position.deleteMany({ where: { poolId } });
  if (poolId) await prisma.pool.deleteMany({ where: { id: poolId } });
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await app.close(); await prisma.$disconnect();
}
