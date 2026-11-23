import { z } from 'zod';

const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const HashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const IntegerStringSchema = z.string().regex(/^\d+$/);
const DecimalStringSchema = z.string().regex(/^\d+(?:\.\d+)?$/);

export const ApiPoolAssetSchema = z.object({
  address: AddressSchema,
  symbol: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  decimals: z.number().int().min(0).max(36),
  chainId: z.number().int().positive(),
  logoUrl: z.string().url().nullable(),
  category: z.enum(['crypto', 'stablecoin', 'stock', 'etf']),
  executable: z.boolean(),
  source: z.enum(['chain', 'robinhood']),
  isin: z.string().nullable(),
  tradingStatus: z.object({ market: z.string().nullable(), extended: z.string().nullable(), overnight: z.string().nullable() }).nullable(),
  currentMultiplier: z.string().nullable(),
});
export const ApiPoolAssetListSchema = z.object({ data: z.array(ApiPoolAssetSchema) });
export type ApiPoolAsset = z.infer<typeof ApiPoolAssetSchema>;

export const ApiAssetReferencePriceSchema = z.object({
  symbol: z.string(),
  priceUsd: DecimalStringSchema,
  bidUsd: DecimalStringSchema,
  askUsd: DecimalStringSchema,
  generatedAt: z.string().datetime(),
  halted: z.boolean(),
  source: z.literal('robinhood'),
  multiplierAdjusted: z.literal(true),
});

export const ApiPoolCreationPreparationSchema = z.object({
  chainId: z.number().int().positive(),
  factory: AddressSchema,
  poolId: HashSchema,
  model: z.enum(['DAMM', 'DLMM']),
  token0: ApiPoolAssetSchema,
  token1: ApiPoolAssetSchema,
  feePips: z.number().int().min(1).max(999_999),
  binStepBps: z.number().int().min(0).max(1_000),
  initialActiveBin: z.number().int().min(-10_000).max(10_000).nullable(),
  representedPrice: DecimalStringSchema.nullable(),
  existingPool: AddressSchema.nullable(),
  predictedPool: AddressSchema,
  transaction: z.object({
    chainId: z.number().int().positive(),
    to: AddressSchema,
    data: z.string().regex(/^0x[a-fA-F0-9]*$/),
    value: z.string().regex(/^0x[a-fA-F0-9]+$/),
    gas: z.string().regex(/^0x[a-fA-F0-9]+$/).optional(),
  }),
  expiresAt: z.string().datetime(),
});
export type ApiPoolCreationPreparation = z.infer<typeof ApiPoolCreationPreparationSchema>;

export const ApiPoolSchema = z.object({
  id: z.string().uuid(),
  chainId: z.number().int().positive(),
  address: AddressSchema,
  type: z.enum(['DLMM', 'DAMM']),
  tokenX: AddressSchema,
  tokenY: AddressSchema,
  tokenXDecimals: z.number().int().min(0).max(36).nullable(),
  tokenYDecimals: z.number().int().min(0).max(36).nullable(),
  quoteToken: AddressSchema.nullable(),
  binStep: z.number().int().min(0),
  baseFeePips: z.number().int().min(0),
  initialActiveBin: z.number().int().nullable(),
  activeBin: z.number().int().nullable(),
  createdBlock: IntegerStringSchema,
});
export type ApiPool = z.infer<typeof ApiPoolSchema>;

export const ApiPoolDetailSchema = ApiPoolSchema.extend({
  counts: z.object({
    positions: z.number().int().nonnegative(),
    swaps: z.number().int().nonnegative(),
    callouts: z.number().int().nonnegative(),
  }),
});
export type ApiPoolDetail = z.infer<typeof ApiPoolDetailSchema>;

export const ApiPoolStatsSchema = z.object({
  swapCount: z.number().int().nonnegative(),
  openPositions: z.number().int().nonnegative(),
  amountIn: DecimalStringSchema,
  amountOut: DecimalStringSchema,
  totalFee: DecimalStringSchema,
  protocolFee: DecimalStringSchema,
});
export type ApiPoolStats = z.infer<typeof ApiPoolStatsSchema>;

export const ApiCandleSchema = z.object({
  timestamp: z.string().datetime(),
  open: DecimalStringSchema,
  high: DecimalStringSchema,
  low: DecimalStringSchema,
  close: DecimalStringSchema,
  volumeX: DecimalStringSchema,
  volumeY: DecimalStringSchema,
  swapCount: z.number().int().nonnegative(),
});
export type ApiCandle = z.infer<typeof ApiCandleSchema>;

export const ApiBinSchema = z.object({
  binId: z.number().int(),
  reserveX: DecimalStringSchema,
  reserveY: DecimalStringSchema,
  totalShares: DecimalStringSchema,
  updatedBlock: IntegerStringSchema,
});
export type ApiBin = z.infer<typeof ApiBinSchema>;

export const ApiTradeSchema = z.object({
  transactionHash: HashSchema,
  logIndex: z.number().int().nonnegative(),
  blockNumber: IntegerStringSchema,
  timestamp: z.string().datetime(),
  sender: AddressSchema,
  recipient: AddressSchema,
  tokenIn: AddressSchema,
  amountIn: DecimalStringSchema,
  amountOut: DecimalStringSchema,
  totalFee: DecimalStringSchema.nullable(),
  protocolFee: DecimalStringSchema,
  activeBinBefore: z.number().int().nullable(),
  activeBinAfter: z.number().int().nullable(),
  binCrossings: z.number().int().nonnegative().nullable(),
});
export type ApiTrade = z.infer<typeof ApiTradeSchema>;

export const ApiLpSchema = z.object({
  id: IntegerStringSchema,
  owner: AddressSchema,
  lowerBin: z.number().int(),
  upperBin: z.number().int(),
  shape: z.number().int(),
  valueQuote: DecimalStringSchema.nullable(),
  earnedQuote: DecimalStringSchema,
});
export type ApiLp = z.infer<typeof ApiLpSchema>;

export const ApiCalloutSchema = z.object({
  id: z.string().uuid(),
  chainId: z.number().int().positive(),
  positionId: IntegerStringSchema,
  caption: z.string().nullable(),
  captionEditedAt: z.string().datetime().nullable(),
  showSize: z.boolean(),
  mcAtPost: DecimalStringSchema.nullable(),
  priceAtPost: DecimalStringSchema.nullable(),
  sizeAtPost: DecimalStringSchema.nullable(),
  side: z.string().nullable(),
  shape: z.number().int(),
  lowerBin: z.number().int(),
  upperBin: z.number().int(),
  createdAt: z.string().datetime(),
  score: DecimalStringSchema.nullable(),
  antiShill: z.object({
    quickExit: z.boolean(),
    quickExitMinutes: z.number().int().min(0).max(30).nullable(),
    hasOppositeSide: z.boolean().nullable(),
    isDevOrTopHolder: z.boolean().nullable(),
    isFreshWallet: z.boolean().nullable(),
    inRangePercentage: z.number().min(0).max(100),
    heldDurationSeconds: IntegerStringSchema,
  }),
  user: z.object({
    id: z.string().uuid(),
    handle: z.string().min(1),
    name: z.string().nullable(),
    avatarUrl: z.string().url().nullable(),
    xVerified: z.boolean(),
  }),
  pool: z.object({
    address: AddressSchema,
    type: z.enum(['DLMM', 'DAMM']),
    tokenX: AddressSchema,
    tokenY: AddressSchema,
    quoteToken: AddressSchema.nullable(),
    binStep: z.number().int().nonnegative(),
    initialActiveBin: z.number().int().nullable(),
    activeBin: z.number().int().nullable(),
  }),
  position: z.object({
    owner: AddressSchema,
    status: z.string(),
    depositedQuote: DecimalStringSchema,
    withdrawnQuote: DecimalStringSchema,
    earnedQuote: DecimalStringSchema,
    valueQuote: DecimalStringSchema.nullable(),
    inRangeSeconds: IntegerStringSchema,
    openSeconds: IntegerStringSchema,
  }),
  stats: z.object({
    likes: z.number().int().nonnegative(),
    reposts: z.number().int().nonnegative(),
    replies: z.number().int().nonnegative(),
    tails: z.number().int().nonnegative(),
  }),
  viewer: z.object({
    liked: z.boolean(),
    reposted: z.boolean(),
    following: z.boolean(),
  }),
  updates: z.array(
    z.object({
      id: z.string().uuid(),
      type: z.string(),
      caption: z.string().nullable(),
      transactionHash: HashSchema,
      blockNumber: IntegerStringSchema,
      timestamp: z.string().datetime(),
      createdAt: z.string().datetime(),
    })
  ),
});
export type ApiCallout = z.infer<typeof ApiCalloutSchema>;

export const ApiSocialToggleSchema = z.object({ active: z.boolean() });
export const ApiFollowToggleSchema = z.object({ following: z.boolean() });
export const ApiReplySchema = z.object({
  id: z.string().uuid(),
  calloutId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  body: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const ApiFeedSchema = z.object({
  data: z.array(ApiCalloutSchema),
  nextCursor: z.string().uuid().nullable(),
});
export type ApiFeed = z.infer<typeof ApiFeedSchema>;

export const ApiLeaderboardRowSchema = z.object({
  userId: z.string().uuid(),
  handle: z.string().min(1),
  name: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  xVerified: z.boolean(),
  rank: z.number().int().positive(),
  callouts: z.number().int().nonnegative(),
  earnedQuote: DecimalStringSchema,
  avgInRange: DecimalStringSchema,
  tailers: z.number().int().nonnegative(),
  quickExits: z.number().int().nonnegative(),
  score: DecimalStringSchema,
  updatedAt: z.string().datetime(),
});
export const ApiLeaderboardSchema = z.object({
  data: z.array(ApiLeaderboardRowSchema),
  nextCursor: z.string().uuid().nullable(),
});
export type ApiLeaderboardRow = z.infer<typeof ApiLeaderboardRowSchema>;

export const ApiFeedRailSchema = z.object({
  trendingPools: z.array(
    z.object({
      chainId: z.number().int().positive(),
      address: AddressSchema,
      tokenX: AddressSchema,
      tokenY: AddressSchema,
      quoteToken: AddressSchema.nullable(),
      callouts24h: z.number().int().nonnegative(),
      change24h: z.number().finite().nullable(),
    })
  ),
  topCallers: z.array(ApiLeaderboardRowSchema),
});
export type ApiFeedRail = z.infer<typeof ApiFeedRailSchema>;

export function apiListSchema<Item extends z.ZodTypeAny>(item: Item) {
  return z.object({ data: z.array(item) });
}
export type ApiList<Item> = { data: Item[] };

export const ApiRealtimeEventSchema = z.object({
  aggregateId: z.string().nullable(),
  createdAt: z.string().datetime(),
  payload: z.unknown(),
});
export type ApiRealtimeEvent = z.infer<typeof ApiRealtimeEventSchema>;

export const ApiMeSchema = z.object({
  id: z.string().uuid(),
  handle: z.string().min(1),
  name: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  xVerified: z.boolean(),
  wallets: z.array(AddressSchema),
});
export type ApiMe = z.infer<typeof ApiMeSchema>;

export const ApiWalletChallengeSchema = z.object({
  challengeId: z.string().uuid(),
  message: z.string().min(1),
  nonce: z.string().min(32).max(128),
  expiresAt: z.string().datetime(),
});
export type ApiWalletChallenge = z.infer<typeof ApiWalletChallengeSchema>;

export const ApiWalletLinkSchema = z.object({
  address: AddressSchema,
  linked: z.literal(true),
});
export type ApiWalletLink = z.infer<typeof ApiWalletLinkSchema>;

export const ApiChainConfigSchema = z.object({
  network: z.enum(['testnet', 'mainnet']),
  chainId: z.number().int().positive(),
  chainIdHex: z.string().regex(/^0x[0-9a-f]+$/),
  chainName: z.string().min(1),
  explorerUrl: z.string().url(),
  nativeCurrency: z.object({
    name: z.literal('Ether'),
    symbol: z.literal('ETH'),
    decimals: z.literal(18),
  }),
});
export type ApiChainConfig = z.infer<typeof ApiChainConfigSchema>;

export const ApiPreparedTransactionSchema = z.object({
  chainId: z.number().int().positive(),
  to: AddressSchema,
  data: z.string().regex(/^0x(?:[a-fA-F0-9]{2})*$/),
  value: z.string().regex(/^0x[0-9a-fA-F]+$/),
  gas: z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/)
    .optional(),
});
export type ApiPreparedTransaction = z.infer<typeof ApiPreparedTransactionSchema>;

export const ApiSwapQuoteSchema = z.object({
  pool: AddressSchema,
  tokenIn: AddressSchema,
  tokenOut: AddressSchema,
  tokenInDecimals: z.number().int().min(0).max(36),
  tokenOutDecimals: z.number().int().min(0).max(36),
  amountIn: DecimalStringSchema,
  amountInRaw: IntegerStringSchema,
  amountOut: DecimalStringSchema,
  amountOutRaw: IntegerStringSchema,
  minimumAmountOut: DecimalStringSchema,
  minimumAmountOutRaw: IntegerStringSchema,
  totalFeeRaw: IntegerStringSchema,
  binCrossings: z.number().int().nonnegative(),
  slippageBps: z.number().int().min(1).max(1_000),
  maximumBinCrossings: z.number().int().min(1).max(64),
  blockNumber: IntegerStringSchema,
  expiresAt: z.string().datetime(),
});
export type ApiSwapQuote = z.infer<typeof ApiSwapQuoteSchema>;

export const ApiSwapPreparationSchema = z.object({
  quote: ApiSwapQuoteSchema,
  approval: ApiPreparedTransactionSchema.nullable(),
  swap: ApiPreparedTransactionSchema,
});
export type ApiSwapPreparation = z.infer<typeof ApiSwapPreparationSchema>;

export const ApiCalloutIntentSchema = z.object({
  intentId: z.string().uuid(),
  tag: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  expiresAt: z.string().datetime(),
});
export type ApiCalloutIntent = z.infer<typeof ApiCalloutIntentSchema>;

export const ApiPositionQuoteSchema = z
  .object({
    pool: AddressSchema,
    tokenX: AddressSchema,
    tokenY: AddressSchema,
    amountX: DecimalStringSchema,
    amountY: DecimalStringSchema,
    amountXRaw: IntegerStringSchema,
    amountYRaw: IntegerStringSchema,
    shape: z.enum(['spot', 'curve', 'bid-ask']),
    activeBin: z.number().int().min(-10_000).max(10_000),
    bins: z.array(z.number().int().min(-10_000).max(10_000)).min(1).max(61),
    amountsXRaw: z.array(IntegerStringSchema).min(1).max(61),
    amountsYRaw: z.array(IntegerStringSchema).min(1).max(61),
    minimumSharesRaw: z.array(IntegerStringSchema).min(1).max(61),
    slippageBps: z.number().int().min(1).max(1_000),
    blockNumber: IntegerStringSchema,
  })
  .superRefine((quote, context) => {
    if (
      quote.amountsXRaw.length !== quote.bins.length ||
      quote.amountsYRaw.length !== quote.bins.length ||
      quote.minimumSharesRaw.length !== quote.bins.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Position arrays must have equal length',
      });
    }
  });
export type ApiPositionQuote = z.infer<typeof ApiPositionQuoteSchema>;

export const ApiPositionPreparationSchema = z.object({
  quote: ApiPositionQuoteSchema,
  approvals: z.array(ApiPreparedTransactionSchema).max(2),
  create: ApiPreparedTransactionSchema,
});
export type ApiPositionPreparation = z.infer<typeof ApiPositionPreparationSchema>;

export const ApiIndexedPositionSchema = z.object({
  id: IntegerStringSchema,
  chainId: z.number().int().positive(),
  poolId: z.string().uuid(),
  owner: AddressSchema,
  lowerBin: z.number().int().min(-10_000).max(10_000),
  upperBin: z.number().int().min(-10_000).max(10_000),
  shape: z.number().int().min(0).max(3),
  tag: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .nullable(),
  referrer: AddressSchema.nullable(),
  status: z.string().min(1),
  depositedQuote: DecimalStringSchema,
  withdrawnQuote: DecimalStringSchema,
  earnedQuote: DecimalStringSchema,
  valueQuote: DecimalStringSchema.nullable(),
  valueQuoteUpdatedAt: z.string().datetime().nullable(),
  valueQuoteBlock: IntegerStringSchema.nullable(),
  inRangeSeconds: IntegerStringSchema,
  openSeconds: IntegerStringSchema,
  openedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
  calloutId: z.string().uuid().nullable(),
  bins: z.array(z.object({ binId: z.number().int(), shares: IntegerStringSchema })),
  pool: ApiPoolSchema,
});
export type ApiIndexedPosition = z.infer<typeof ApiIndexedPositionSchema>;

export const ApiIndexedPositionListSchema = z.object({ data: z.array(ApiIndexedPositionSchema) });
export type ApiIndexedPositionList = z.infer<typeof ApiIndexedPositionListSchema>;

export const ApiPositionActionQuoteSchema = z.object({
  positionId: IntegerStringSchema,
  action: z.enum(['increase', 'decrease', 'close']),
  amountXRaw: IntegerStringSchema,
  amountYRaw: IntegerStringSchema,
  minimumAmountXRaw: IntegerStringSchema.optional(),
  minimumAmountYRaw: IntegerStringSchema.optional(),
  slippageBps: z.number().int().min(1).max(1_000),
  blockNumber: IntegerStringSchema,
});
export type ApiPositionActionQuote = z.infer<typeof ApiPositionActionQuoteSchema>;

export const ApiPositionActionPreparationSchema = z.object({
  quote: ApiPositionActionQuoteSchema,
  approvals: z.array(ApiPreparedTransactionSchema).max(2),
  action: ApiPreparedTransactionSchema,
});
export type ApiPositionActionPreparation = z.infer<typeof ApiPositionActionPreparationSchema>;

export const ApiTailQuoteSchema = z.object({
  mode: z.enum(['same_range', 'same_shape_now']),
  pool: AddressSchema,
  poolType: z.enum(['DLMM', 'DAMM']),
  expectedActiveBin: z.number().int().nullable(),
  lowerBin: z.number().int().nullable(),
  upperBin: z.number().int().nullable(),
  shape: z.number().int().min(0).max(3),
  requiresTokenX: z.boolean(),
  requiresTokenY: z.boolean(),
  warnings: z.array(z.string()),
});
export type ApiTailQuote = z.infer<typeof ApiTailQuoteSchema>;

export const ApiTailIntentSchema = z.object({
  intentId: z.string().uuid(),
  tag: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  referrer: AddressSchema,
  expiresAt: z.string().datetime(),
  quote: ApiTailQuoteSchema,
});
export type ApiTailIntent = z.infer<typeof ApiTailIntentSchema>;

export const ApiTailPreparationSchema = z.object({
  quote: ApiTailQuoteSchema.extend({
    amountXRaw: IntegerStringSchema,
    amountYRaw: IntegerStringSchema,
    blockNumber: IntegerStringSchema,
  }),
  approvals: z.array(ApiPreparedTransactionSchema).max(2),
  create: ApiPreparedTransactionSchema,
});
export type ApiTailPreparation = z.infer<typeof ApiTailPreparationSchema>;
