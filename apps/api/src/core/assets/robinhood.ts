import { formatUnits, getAddress, parseUnits, type Address } from 'viem';
import { z } from 'zod';

const MAINNET_CHAIN_ID = 4663;
const CACHE_MS = 15 * 60_000;
const assetSchema = z.object({
  id: z.string().min(1).max(80),
  tokenSymbol: z.string().min(1).max(64),
  tokenName: z.string().min(1),
  tokenDecimals: z.number().int().min(0).max(36),
  logoUrl: z.string().url().nullable().optional(),
  isin: z.string().nullable().optional(),
  status: z.string(),
  currentMultiplier: z.string().nullable().optional(),
  tradingCapabilities: z.object({
    market: z.object({ whole: z.string() }).optional(),
    extended: z.object({ whole: z.string() }).optional(),
    overnight: z.object({ whole: z.string() }).optional(),
  }).optional(),
  deployments: z.array(z.object({ contractAddress: z.string(), chainId: z.number().int() })),
});
const responseSchema = z.object({ assets: z.array(assetSchema) });

export interface CatalogAsset {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoUrl: string | null;
  category: 'stock' | 'etf';
  executable: boolean;
  source: 'robinhood';
  isin: string | null;
  sourceAssetId: string;
  status: string;
  currentMultiplier: string | null;
  tradingStatus: { market: string | null; extended: string | null; overnight: string | null };
}

let cache: { expiresAt: number; assets: CatalogAsset[] } | null = null;
const priceCache = new Map<string, { expiresAt: number; value: ReferencePrice }>();

export interface ReferencePrice {
  symbol: string;
  priceUsd: string;
  bidUsd: string;
  askUsd: string;
  generatedAt: string;
  halted: boolean;
  source: 'robinhood';
  multiplierAdjusted: true;
}

export async function robinhoodAssets(activeChainId: number): Promise<CatalogAsset[]> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.assets.map(asset => ({ ...asset, executable: asset.chainId === activeChainId }));
  }
  const response = await fetch('https://api.robinhood.com/rhj/assets', {
    headers: { accept: 'application/json', 'user-agent': 'Fomeora asset catalog/1.0' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error('ROBINHOOD_ASSET_SOURCE_UNAVAILABLE');
  const payload = responseSchema.parse(await response.json());
  const assets = payload.assets.flatMap(asset => {
    if (asset.status !== 'ASSET_STATUS_ACTIVE') return [];
    const deployment = asset.deployments.find(item => item.chainId === MAINNET_CHAIN_ID);
    if (!deployment) return [];
    try {
      const name = asset.tokenName.replace(/\s*•\s*Robinhood Token\s*$/u, '').replace(/\s+/gu, ' ').trim();
      const isEtf = /ETF|TRUST|FUND/i.test(name);
      return [{
        address: getAddress(deployment.contractAddress), symbol: asset.tokenSymbol, name,
        decimals: asset.tokenDecimals, chainId: MAINNET_CHAIN_ID, logoUrl: asset.logoUrl ?? null,
        category: isEtf ? 'etf' as const : 'stock' as const, executable: activeChainId === MAINNET_CHAIN_ID,
        source: 'robinhood' as const, isin: asset.isin ?? null, sourceAssetId: asset.id, status: asset.status,
        currentMultiplier: asset.currentMultiplier ?? null,
        tradingStatus: {
          market: asset.tradingCapabilities?.market?.whole ?? null,
          extended: asset.tradingCapabilities?.extended?.whole ?? null,
          overnight: asset.tradingCapabilities?.overnight?.whole ?? null,
        },
      }];
    } catch { return []; }
  }).sort((a, b) => a.symbol.localeCompare(b.symbol));
  cache = { expiresAt: Date.now() + CACHE_MS, assets };
  return assets;
}

export async function robinhoodReferencePrice(symbol: string, multiplier: string): Promise<ReferencePrice> {
  const key = symbol.toUpperCase();
  const cached = priceCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const response = await fetch(`https://api.robinhood.com/rhj/prices/${encodeURIComponent(key)}`, {
    headers: { accept: 'application/json', 'user-agent': 'Fomeora price reference/1.0' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error('ROBINHOOD_PRICE_UNAVAILABLE');
  const parsed = z.object({ quotes: z.array(z.object({
    tokenSymbol: z.string(), bid: z.string().regex(/^\d+(?:\.\d+)?$/), ask: z.string().regex(/^\d+(?:\.\d+)?$/),
    generatedAt: z.string().datetime(), isTradingHalt: z.boolean(), currency: z.literal('USD'),
  })).min(1) }).parse(await response.json());
  const quote = parsed.quotes.find(item => item.tokenSymbol.toUpperCase() === key) ?? parsed.quotes[0]!;
  const scale = 10n ** 18n;
  const bid = parseUnits(quote.bid, 18) * parseUnits(multiplier, 18) / scale;
  const ask = parseUnits(quote.ask, 18) * parseUnits(multiplier, 18) / scale;
  const value: ReferencePrice = {
    symbol: key, bidUsd: formatUnits(bid, 18), askUsd: formatUnits(ask, 18),
    priceUsd: formatUnits((bid + ask) / 2n, 18), generatedAt: quote.generatedAt,
    halted: quote.isTradingHalt, source: 'robinhood', multiplierAdjusted: true,
  };
  priceCache.set(key, { expiresAt: Date.now() + 15_000, value });
  return value;
}
