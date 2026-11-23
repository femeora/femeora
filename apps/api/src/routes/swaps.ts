import {
  dammPoolAbi,
  dlmmPoolV2Abi,
  getFomeoraDeployment,
  swapRouterAbi,
} from '@fomeora/contracts-sdk';
import { prisma } from '@fomeora/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  encodeFunctionData,
  formatUnits,
  parseAbi,
  parseUnits,
  toHex,
  type Address,
} from 'viem';
import { z } from 'zod';

import { resolveSession, SESSION_COOKIE_NAME } from '../core/auth/session.js';
import type { ApiChainClient } from '../core/chain-client.js';
import { quoteDammExactInput, quoteDlmmExactInput } from '../core/swaps/quote.js';

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/).transform(value => value.toLowerCase() as Address);
const paramsSchema = z.object({ pool: addressSchema });
const requestSchema = z.object({
  tokenIn: addressSchema,
  amountIn: z.string().regex(/^\d+(?:\.\d+)?$/).max(80),
  slippageBps: z.number().int().min(1).max(1_000).default(50),
  maximumBinCrossings: z.number().int().min(1).max(64).default(32),
});
const prepareSchema = requestSchema.extend({ walletAddress: addressSchema });
const erc20Abi = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);
const QUOTE_TTL_SECONDS = 30;
const SWAP_DEADLINE_SECONDS = 10 * 60;

class SwapRouteError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

async function canonicalPool(chainId: number, address: string) {
  return prisma.pool.findFirst({
    where: { chainId, address, canonical: true },
    select: {
      id: true,
      address: true,
      type: true,
      tokenX: true,
      tokenY: true,
      tokenXDecimals: true,
      tokenYDecimals: true,
      binStep: true,
      activeBin: true,
    },
  });
}

async function safeBlock(chainId: number): Promise<bigint> {
  const health = await prisma.indexerHealth.findUnique({ where: { chainId } });
  if (!health?.lastSuccessAt || Date.now() - health.lastSuccessAt.getTime() > 5 * 60 * 1_000) {
    throw new SwapRouteError(503, 'INDEXER_NOT_READY');
  }
  return health.safeBlock;
}

// DAMM and DLMM deliberately share one guarded entry point so response invariants stay identical.
// eslint-disable-next-line complexity
async function buildQuote(
  chainId: number,
  client: ApiChainClient,
  pool: NonNullable<Awaited<ReturnType<typeof canonicalPool>>>,
  input: z.infer<typeof requestSchema>,
  blockProvider: (chainId: number) => Promise<bigint>,
) {
  const token0ToToken1 = input.tokenIn === pool.tokenX.toLowerCase();
  if (!token0ToToken1 && input.tokenIn !== pool.tokenY.toLowerCase()) {
    throw new SwapRouteError(400, 'TOKEN_NOT_IN_POOL');
  }
  const tokenOut = (token0ToToken1 ? pool.tokenY : pool.tokenX) as Address;
  const tokenInDecimals = token0ToToken1 ? pool.tokenXDecimals : pool.tokenYDecimals;
  const tokenOutDecimals = token0ToToken1 ? pool.tokenYDecimals : pool.tokenXDecimals;
  if (tokenInDecimals === null || tokenOutDecimals === null) {
    throw new SwapRouteError(409, 'TOKEN_DECIMALS_UNAVAILABLE');
  }
  let amountInRaw: bigint;
  try {
    amountInRaw = parseUnits(input.amountIn, tokenInDecimals);
  } catch {
    throw new SwapRouteError(400, 'INVALID_TOKEN_AMOUNT');
  }
  if (amountInRaw <= 0n) throw new SwapRouteError(400, 'INVALID_TOKEN_AMOUNT');
  const blockNumber = await blockProvider(chainId);
  const poolAddress = pool.address as Address;

  let result: { amountOut: bigint; totalFee: bigint; binCrossings: number };
  try {
    if (pool.type === 'DAMM') {
      const [reserve0, reserve1, feePips] = await Promise.all([
        client.readContract({ address: poolAddress, abi: dammPoolAbi, functionName: 'reserve0', blockNumber }),
        client.readContract({ address: poolAddress, abi: dammPoolAbi, functionName: 'reserve1', blockNumber }),
        client.readContract({ address: poolAddress, abi: dammPoolAbi, functionName: 'feePips', blockNumber }),
      ]);
      result = quoteDammExactInput({
        amountIn: amountInRaw,
        reserveIn: token0ToToken1 ? reserve0 : reserve1,
        reserveOut: token0ToToken1 ? reserve1 : reserve0,
        feePips,
      });
    } else if (pool.type === 'DLMM') {
      if (pool.activeBin === null) throw new SwapRouteError(409, 'ACTIVE_BIN_UNAVAILABLE');
      const [active, directional, feePips] = await Promise.all([
        prisma.bin.findUnique({ where: { poolId_binId: { poolId: pool.id, binId: pool.activeBin } } }),
        prisma.bin.findMany({
          where: {
            poolId: pool.id,
            binId: token0ToToken1 ? { lt: pool.activeBin } : { gt: pool.activeBin },
            ...(token0ToToken1 ? { reserveY: { gt: 0 } } : { reserveX: { gt: 0 } }),
          },
          orderBy: { binId: token0ToToken1 ? 'desc' : 'asc' },
          take: input.maximumBinCrossings,
        }),
        client.readContract({
          address: poolAddress,
          abi: dlmmPoolV2Abi,
          functionName: 'currentFeePips',
          blockNumber,
        }),
      ]);
      const rows = active ? [active, ...directional] : directional;
      result = quoteDlmmExactInput({
        amountIn: amountInRaw,
        token0ToToken1,
        feePips,
        binStepBps: pool.binStep,
        maximumBinCrossings: input.maximumBinCrossings,
        bins: rows.map(bin => ({
          binId: bin.binId,
          reserve0: BigInt(bin.reserveX.toString()),
          reserve1: BigInt(bin.reserveY.toString()),
        })),
      });
    } else {
      throw new SwapRouteError(409, 'POOL_TYPE_UNSUPPORTED');
    }
  } catch (error) {
    if (error instanceof SwapRouteError) throw error;
    if (error instanceof RangeError && error.message === 'INSUFFICIENT_LIQUIDITY') {
      throw new SwapRouteError(409, 'INSUFFICIENT_LIQUIDITY');
    }
    throw new SwapRouteError(503, 'QUOTE_STATE_UNAVAILABLE');
  }

  const minimumAmountOutRaw = result.amountOut * BigInt(10_000 - input.slippageBps) / 10_000n;
  const expiresAt = new Date(Date.now() + QUOTE_TTL_SECONDS * 1_000);
  return {
    pool: pool.address,
    tokenIn: input.tokenIn,
    tokenOut,
    tokenInDecimals,
    tokenOutDecimals,
    amountIn: formatUnits(amountInRaw, tokenInDecimals),
    amountInRaw: amountInRaw.toString(),
    amountOut: formatUnits(result.amountOut, tokenOutDecimals),
    amountOutRaw: result.amountOut.toString(),
    minimumAmountOut: formatUnits(minimumAmountOutRaw, tokenOutDecimals),
    minimumAmountOutRaw: minimumAmountOutRaw.toString(),
    totalFeeRaw: result.totalFee.toString(),
    binCrossings: result.binCrossings,
    slippageBps: input.slippageBps,
    maximumBinCrossings: input.maximumBinCrossings,
    blockNumber: blockNumber.toString(),
    expiresAt: expiresAt.toISOString(),
  };
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof SwapRouteError) return reply.status(error.status).send({ error: error.code });
  return reply.status(500).send({ error: 'SWAP_REQUEST_FAILED' });
}

export async function registerSwapRoutes(
  app: FastifyInstance,
  chainId: number,
  client: ApiChainClient,
  blockProvider: (chainId: number) => Promise<bigint> = safeBlock,
) {
  app.post('/v1/pools/:pool/swap-quote', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = requestSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'INVALID_SWAP_QUOTE' });
    try {
      const pool = await canonicalPool(chainId, params.data.pool);
      if (!pool) throw new SwapRouteError(404, 'POOL_NOT_FOUND');
      return await buildQuote(chainId, client, pool, body.data, blockProvider);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/v1/pools/:pool/swap-prepare', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (request, reply) => {
    const session = await resolveSession(request.cookies[SESSION_COOKIE_NAME]);
    if (!session) return reply.status(401).send({ error: 'AUTHENTICATION_REQUIRED' });
    const params = paramsSchema.safeParse(request.params);
    const body = prepareSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'INVALID_SWAP_PREPARATION' });
    if (!session.user.wallets.some(wallet => wallet.address.toLowerCase() === body.data.walletAddress)) {
      return reply.status(403).send({ error: 'WALLET_NOT_LINKED' });
    }
    try {
      const pool = await canonicalPool(chainId, params.data.pool);
      if (!pool) throw new SwapRouteError(404, 'POOL_NOT_FOUND');
      const quote = await buildQuote(chainId, client, pool, body.data, blockProvider);
      const deployment = getFomeoraDeployment(chainId);
      const router = deployment.swapRouter as Address;
      const amountInRaw = BigInt(quote.amountInRaw);
      const allowance = await client.readContract({
        address: quote.tokenIn,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [body.data.walletAddress, router],
      });
      const approvalData = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [router, amountInRaw] });
      const approvalGas = allowance === amountInRaw ? null : await client.estimateGas({
        account: body.data.walletAddress,
        to: quote.tokenIn,
        data: approvalData,
        value: 0n,
      });
      const approval = allowance === amountInRaw ? null : {
        chainId,
        to: quote.tokenIn,
        data: approvalData,
        value: '0x0',
        gas: toHex(approvalGas as bigint),
      };
      const deadline = BigInt(Math.floor(Date.now() / 1_000) + SWAP_DEADLINE_SECONDS);
      const token0ToToken1 = quote.tokenIn.toLowerCase() === pool.tokenX.toLowerCase();
      const data = pool.type === 'DAMM'
        ? encodeFunctionData({
            abi: swapRouterAbi,
            functionName: 'swapDammExactInput',
            args: [pool.address as Address, quote.tokenIn, amountInRaw, BigInt(quote.minimumAmountOutRaw), body.data.walletAddress, deadline],
          })
        : encodeFunctionData({
            abi: swapRouterAbi,
            functionName: 'swapDlmmExactInput',
            args: [pool.address as Address, token0ToToken1, amountInRaw, BigInt(quote.minimumAmountOutRaw), body.data.maximumBinCrossings, body.data.walletAddress, deadline],
          });
      let swapGas: bigint | null = null;
      if (!approval) {
        try {
          swapGas = await client.estimateGas({
            account: body.data.walletAddress,
            to: router,
            data,
            value: 0n,
          });
        } catch {
          throw new SwapRouteError(409, 'SWAP_SIMULATION_FAILED');
        }
      }
      return {
        quote,
        approval,
        swap: {
          chainId,
          to: router,
          data,
          value: '0x0',
          ...(swapGas === null ? {} : { gas: toHex(swapGas) }),
        },
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
