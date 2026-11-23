import { getFomeoraDeployment, poolFactoryAbi, poolRegistryAbi } from '@fomeora/contracts-sdk';
import { prisma } from '@fomeora/database';
import { binForPriceX18, PRICE_SCALE, priceFromBinX18, rawUnitsToDecimal } from '@fomeora/sdk';
import type { FastifyInstance } from 'fastify';
import { encodeAbiParameters, encodeFunctionData, getAddress, keccak256, parseAbi, parseUnits, toHex, zeroAddress, type Address } from 'viem';
import { z } from 'zod';

import type { ApiChainClient } from '../core/chain-client.js';
import { robinhoodAssets, robinhoodReferencePrice } from '../core/assets/robinhood.js';

const erc20Abi = parseAbi(['function symbol() view returns (string)', 'function name() view returns (string)', 'function decimals() view returns (uint8)']);
const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/).transform(value => getAddress(value));
const requestSchema = z.object({
  tokenA: address,
  tokenB: address,
  model: z.enum(['DAMM', 'DLMM']),
  feePips: z.number().int().min(1).max(999_999),
  binStepBps: z.number().int().min(0).max(1_000),
  initialPrice: z.string().regex(/^\d+(?:\.\d+)?$/).optional(),
  wallet: address,
}).strict();

async function metadata(client: ApiChainClient, token: Address) {
  const code = await client.getBytecode({ address: token });
  if (!code || code === '0x') throw new Error('TOKEN_CONTRACT_REQUIRED');
  const [symbol, name, decimals] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
    client.readContract({ address: token, abi: erc20Abi, functionName: 'name' }).catch(() => ''),
    client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
  ]);
  return { address: token, symbol: String(symbol).slice(0, 64), name: String(name || symbol).slice(0, 128), decimals: Number(decimals) };
}

async function persistRobinhoodAssets(stocks: Awaited<ReturnType<typeof robinhoodAssets>>) {
  const syncedAt = new Date();
  await prisma.$transaction(stocks.map(asset => prisma.assetCatalog.upsert({
    where: { chainId_address: { chainId: asset.chainId, address: asset.address.toLowerCase() } },
    create: {
      chainId: asset.chainId, address: asset.address.toLowerCase(), source: asset.source,
      sourceAssetId: asset.sourceAssetId, symbol: asset.symbol, name: asset.name, decimals: asset.decimals,
      logoUrl: asset.logoUrl, category: asset.category, isin: asset.isin, status: asset.status,
      currentMultiplier: asset.currentMultiplier, marketStatus: asset.tradingStatus.market,
      extendedStatus: asset.tradingStatus.extended, overnightStatus: asset.tradingStatus.overnight,
      sourceUpdatedAt: syncedAt,
    },
    update: {
      sourceAssetId: asset.sourceAssetId, symbol: asset.symbol, name: asset.name, decimals: asset.decimals,
      logoUrl: asset.logoUrl, category: asset.category, isin: asset.isin, status: asset.status,
      currentMultiplier: asset.currentMultiplier, marketStatus: asset.tradingStatus.market,
      extendedStatus: asset.tradingStatus.extended, overnightStatus: asset.tradingStatus.overnight,
      sourceUpdatedAt: syncedAt,
    },
  })));
}

export async function registerPoolCreationRoutes(app: FastifyInstance, chainId: number, client: ApiChainClient) {
  const deployment = getFomeoraDeployment(chainId);

  app.get('/v1/pool-assets', async () => {
    const pools = await prisma.pool.findMany({ where: { chainId, canonical: true }, select: { tokenX: true, tokenY: true } });
    const tokens = [...new Set(pools.flatMap(pool => [pool.tokenX, pool.tokenY]))] as Address[];
    const chainAssets = (await Promise.all(tokens.map(token => metadata(client, token)))).map(asset => ({
      ...asset, chainId, logoUrl: null, category: asset.symbol.toUpperCase().includes('USD') ? 'stablecoin' as const : 'crypto' as const,
      executable: true, source: 'chain' as const, isin: null, tradingStatus: null, currentMultiplier: null,
    }));
    let stocks;
    try {
      stocks = await robinhoodAssets(chainId);
      // Catalog persistence must not hold the user-facing request open. The
      // database is a resilience cache; the fetched catalog can be returned now.
      void persistRobinhoodAssets(stocks).catch(error => {
        app.log.warn({ error }, 'Unable to refresh the Robinhood asset cache');
      });
    } catch {
      const cached = await prisma.assetCatalog.findMany({ where: { chainId: 4663, source: 'robinhood', status: 'ASSET_STATUS_ACTIVE' } });
      stocks = cached.map(asset => ({
        address: getAddress(asset.address), symbol: asset.symbol, name: asset.name, decimals: asset.decimals,
        chainId: asset.chainId, logoUrl: asset.logoUrl, category: asset.category === 'etf' ? 'etf' as const : 'stock' as const,
        executable: asset.chainId === chainId, source: 'robinhood' as const, isin: asset.isin,
        sourceAssetId: asset.sourceAssetId ?? '', status: asset.status, currentMultiplier: asset.currentMultiplier,
        tradingStatus: { market: asset.marketStatus, extended: asset.extendedStatus, overnight: asset.overnightStatus },
      }));
    }
    const byIdentity = new Map([...chainAssets, ...stocks].map(asset => [`${asset.chainId}:${asset.address.toLowerCase()}`, asset]));
    return { data: [...byIdentity.values()].sort((a, b) => Number(b.executable) - Number(a.executable) || a.symbol.localeCompare(b.symbol)) };
  });

  app.get('/v1/pool-assets/:asset/reference-price', async (request, reply) => {
    const params = z.object({ asset: address }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'INVALID_ASSET_ADDRESS' });
    const asset = await prisma.assetCatalog.findUnique({
      where: { chainId_address: { chainId, address: params.data.asset.toLowerCase() } },
    });
    if (!asset || asset.source !== 'robinhood' || !asset.currentMultiplier) {
      return reply.status(404).send({ error: 'REFERENCE_PRICE_UNAVAILABLE' });
    }
    try { return await robinhoodReferencePrice(asset.symbol, asset.currentMultiplier); }
    catch { return reply.status(503).send({ error: 'REFERENCE_PRICE_UNAVAILABLE' }); }
  });

  app.post('/v1/pools/create-prepare', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_POOL_PARAMETERS' });
    const input = parsed.data;
    if (input.tokenA === input.tokenB || (input.model === 'DAMM' && input.binStepBps !== 0)
      || (input.model === 'DLMM' && (!input.initialPrice || input.binStepBps === 0))) {
      return reply.status(400).send({ error: 'INVALID_POOL_PARAMETERS' });
    }
    try {
      const aFirst = BigInt(input.tokenA) < BigInt(input.tokenB);
      const token0Address = aFirst ? input.tokenA : input.tokenB;
      const token1Address = aFirst ? input.tokenB : input.tokenA;
      const [token0, token1, permissionless] = await Promise.all([
        metadata(client, token0Address), metadata(client, token1Address),
        client.readContract({ address: deployment.poolFactory, abi: poolFactoryAbi, functionName: 'permissionlessCreation' }),
      ]);
      if (!permissionless) return reply.status(403).send({ error: 'POOL_CREATION_NOT_PERMISSIONLESS' });
      const model = input.model === 'DAMM' ? 0 : 1;
      const key = { token0: token0Address, token1: token1Address, model, feePips: input.feePips, binStepBps: input.binStepBps } as const;
      const poolId = keccak256(encodeAbiParameters([{ type: 'tuple', components: [
        { name: 'token0', type: 'address' }, { name: 'token1', type: 'address' }, { name: 'model', type: 'uint8' },
        { name: 'feePips', type: 'uint24' }, { name: 'binStepBps', type: 'uint16' },
      ] }], [key]));
      const existingPool = await client.readContract({ address: deployment.poolRegistry, abi: poolRegistryAbi, functionName: 'poolById', args: [poolId] });
      let initialActiveBin: number | null = null;
      let representedPrice: string | null = null;
      if (input.model === 'DLMM') {
        let desired = parseUnits(input.initialPrice!, 18);
        if (!aFirst) desired = PRICE_SCALE * PRICE_SCALE / desired;
        const selectedBin = binForPriceX18(desired, input.binStepBps);
        initialActiveBin = selectedBin;
        const represented = priceFromBinX18(selectedBin, input.binStepBps);
        representedPrice = rawUnitsToDecimal(aFirst ? represented : PRICE_SCALE * PRICE_SCALE / represented, 18, 12);
      }
      const functionName = input.model === 'DAMM' ? 'createPool' : 'createDlmmPool';
      const args = input.model === 'DAMM'
        ? [input.tokenA, input.tokenB, 0, input.feePips, 0] as const
        : [input.tokenA, input.tokenB, input.feePips, input.binStepBps, initialActiveBin!] as const;
      const data = encodeFunctionData({ abi: poolFactoryAbi, functionName, args } as never);
      const predictedPool = input.model === 'DAMM'
        ? await client.readContract({ address: deployment.poolFactory, abi: poolFactoryAbi, functionName: 'predictPoolAddress', args: [key, deployment.poolFactory] })
        : await client.readContract({ address: deployment.poolFactory, abi: poolFactoryAbi, functionName: 'predictDlmmPoolAddress', args: [key, deployment.poolFactory, initialActiveBin!] });
      let gas: bigint | undefined;
      if (existingPool === zeroAddress) gas = await client.estimateGas({ account: input.wallet, to: deployment.poolFactory, data, value: 0n });
      return {
        chainId, factory: deployment.poolFactory, poolId, model: input.model,
        token0: { ...token0, chainId, logoUrl: null, category: token0.symbol.toUpperCase().includes('USD') ? 'stablecoin' : 'crypto', executable: true, source: 'chain', isin: null, tradingStatus: null, currentMultiplier: null },
        token1: { ...token1, chainId, logoUrl: null, category: token1.symbol.toUpperCase().includes('USD') ? 'stablecoin' : 'crypto', executable: true, source: 'chain', isin: null, tradingStatus: null, currentMultiplier: null },
        feePips: input.feePips, binStepBps: input.binStepBps, initialActiveBin, representedPrice,
        existingPool: existingPool === zeroAddress ? null : existingPool, predictedPool,
        transaction: { chainId, to: deployment.poolFactory, data, value: '0x0', ...(gas ? { gas: toHex(gas) } : {}) },
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      };
    } catch (error) {
      const safeCode = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : 'POOL_SIMULATION_FAILED';
      request.log.warn({ code: safeCode }, 'Pool preparation rejected');
      return reply.status(409).send({ error: safeCode });
    }
  });
}
