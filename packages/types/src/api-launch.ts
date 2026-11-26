import { z } from 'zod';

const Address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const Integer = z.string().regex(/^\d+$/);
const Decimal = z.string().regex(/^\d+(?:\.\d+)?$/);
const Transaction = z.object({
  chainId: z.number().int().positive(),
  to: Address,
  data: z.string().regex(/^0x[a-fA-F0-9]*$/),
  value: z.string().regex(/^0x[a-fA-F0-9]+$/),
  gas: z
    .string()
    .regex(/^0x[a-fA-F0-9]+$/)
    .optional(),
});

const LaunchpadSocialUser = z.object({
  id: z.string().uuid(),
  handle: z.string().min(1),
  name: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  xVerified: z.boolean(),
});

export const ApiLaunchpadReplySchema = z.object({
  id: z.string().uuid(),
  launchpadId: Integer,
  parentId: z.string().uuid().nullable(),
  kind: z.enum(['reply', 'quote']),
  body: z.string().min(1),
  createdAt: z.string().datetime(),
  user: LaunchpadSocialUser,
});
export type ApiLaunchpadReply = z.infer<typeof ApiLaunchpadReplySchema>;

export const ApiLaunchpadSchema = z.object({
  id: Integer,
  owner: Address,
  feeRecipient: Address,
  admins: z.array(Address),
  name: z.string(),
  slug: z.string(),
  metadataUri: z.string(),
  logoUrl: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  domain: z.string(),
  xHandle: z.string(),
  ownerProfile: z
    .object({
      handle: z.string(),
      name: z.string().nullable(),
      avatarUrl: z.string().nullable(),
      xVerified: z.boolean(),
    })
    .nullable(),
  social: z.object({
    likes: z.number().int().nonnegative(),
    reposts: z.number().int().nonnegative(),
    replies: z.number().int().nonnegative(),
    quotes: z.number().int().nonnegative(),
    views: z.number().int().nonnegative(),
  }),
  viewer: z.object({
    liked: z.boolean(),
    reposted: z.boolean(),
  }),
  comments: z.array(ApiLaunchpadReplySchema),
  quoteToken: Address,
  tradeFeePips: z.number().int().nonnegative(),
  creatorSharePips: z.number().int().nonnegative(),
  launchpadSharePips: z.number().int().nonnegative(),
  protocolSharePips: z.number().int().nonnegative(),
  lpCreatorSharePips: z.number().int().nonnegative(),
  lpLaunchpadSharePips: z.number().int().nonnegative(),
  lpProtocolSharePips: z.number().int().nonnegative(),
  graduationThresholdRaw: Integer,
  curveTokenSupplyRaw: Integer,
  graduationTarget: z.literal('DAMM'),
  startFeePips: z.number().int().nonnegative(),
  endFeePips: z.number().int().nonnegative(),
  feeDurationSeconds: z.number().int().positive(),
  feeCurve: z.enum(['linear', 'exponential']),
  protection: z.object({
    enabled: z.boolean(),
    xRequired: z.boolean(),
    devBuyCapPips: z.number().int().nonnegative(),
    earlyBuyCapPips: z.number().int().nonnegative(),
    earlyBuyDurationSeconds: z.number().int().nonnegative(),
  }),
  active: z.boolean(),
  launchCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type ApiLaunchpad = z.infer<typeof ApiLaunchpadSchema>;

export const ApiLaunchpadDashboardSchema = z.object({
  launches: z.number().int().nonnegative(),
  liveCurves: z.number().int().nonnegative(),
  graduations: z.number().int().nonnegative(),
  volumeQuoteRaw: Integer,
  creatorRevenueRaw: Integer,
  launchpadRevenueRaw: Integer,
  protocolRevenueRaw: Integer,
  revenueByToken: z.array(
    z.object({
      token: Address,
      creatorRaw: Integer,
      launchpadRaw: Integer,
      protocolRaw: Integer,
    })
  ),
});

export const ApiCurveTradeSchema = z.object({
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  logIndex: z.number().int().nonnegative(),
  side: z.enum(['buy', 'sell']),
  trader: Address,
  recipient: Address,
  quoteAmountRaw: Integer,
  tokenAmountRaw: Integer,
  feeAmountRaw: Integer,
  progressPips: z.number().int().min(0).max(1_000_000),
  timestamp: z.string().datetime(),
});

export const ApiLaunchSchema = z.object({
  id: Integer,
  chainId: z.number().int().positive(),
  launchpadId: Integer,
  creator: Address,
  token: Address,
  curve: Address,
  name: z.string(),
  symbol: z.string(),
  metadataUri: z.string(),
  imageUrl: z.string().nullable(),
  website: z.string().nullable(),
  xHandle: z.string().nullable(),
  totalSupplyRaw: Integer,
  quoteReserveRaw: Integer,
  tokenInventoryRaw: Integer,
  progressPips: z.number().int().min(0).max(1_000_000),
  status: z.enum(['curve', 'graduated']),
  createdAt: z.string().datetime(),
  creatorProfile: z
    .object({
      handle: z.string(),
      name: z.string().nullable(),
      avatarUrl: z.string().nullable(),
      xVerified: z.boolean(),
    })
    .nullable(),
  devHoldingsPips: z.number().int().min(0).max(1_000_000),
  launchpad: z.object({
    id: Integer,
    name: z.string(),
    slug: z.string(),
    quoteToken: Address,
    tradeFeePips: z.number().int().nonnegative(),
    graduationThresholdRaw: Integer,
    curveTokenSupplyRaw: Integer.optional(),
    protectionEnabled: z.boolean(),
    xRequired: z.boolean(),
  }),
  graduation: z
    .object({
      pool: Address,
      positionId: Integer,
      tokenAmountRaw: Integer,
      quoteAmountRaw: Integer,
      timestamp: z.string().datetime(),
    })
    .nullable(),
});
export type ApiLaunch = z.infer<typeof ApiLaunchSchema>;
export const ApiLaunchpadDetailSchema = ApiLaunchpadSchema.extend({
  launches: z.array(ApiLaunchSchema),
  dashboard: ApiLaunchpadDashboardSchema,
});
export type ApiLaunchpadDetail = z.infer<typeof ApiLaunchpadDetailSchema>;
export const ApiLaunchDetailSchema = ApiLaunchSchema.extend({
  trades: z.array(ApiCurveTradeSchema),
});
export type ApiLaunchDetail = z.infer<typeof ApiLaunchDetailSchema>;

export const ApiLaunchpadPreparationSchema = z.object({
  launchpadFactory: Address,
  transaction: Transaction,
  expiresAt: z.string().datetime(),
});
export type ApiLaunchpadPreparation = z.infer<typeof ApiLaunchpadPreparationSchema>;

export const ApiLaunchpadStatusPreparationSchema = z.object({
  transaction: Transaction,
  expiresAt: z.string().datetime(),
});
export type ApiLaunchpadStatusPreparation = z.infer<typeof ApiLaunchpadStatusPreparationSchema>;

export const ApiTokenLaunchPreparationSchema = z.object({
  launchFactory: Address,
  identityRequired: z.boolean(),
  identityDeadline: Integer,
  transaction: Transaction,
  expiresAt: z.string().datetime(),
});
export type ApiTokenLaunchPreparation = z.infer<typeof ApiTokenLaunchPreparationSchema>;

export const ApiCurveQuoteSchema = z.object({
  side: z.enum(['buy', 'sell']),
  amountIn: Decimal,
  amountInRaw: Integer,
  amountOut: Decimal,
  amountOutRaw: Integer,
  minimumAmountOut: Decimal,
  minimumAmountOutRaw: Integer,
  feeRaw: Integer,
  progressPips: z.number().int().min(0).max(1_000_000),
  expiresAt: z.string().datetime(),
});
export type ApiCurveQuote = z.infer<typeof ApiCurveQuoteSchema>;

export const ApiCurveTradePreparationSchema = ApiCurveQuoteSchema.extend({
  approval: Transaction.nullable(),
  transaction: Transaction,
});
export type ApiCurveTradePreparation = z.infer<typeof ApiCurveTradePreparationSchema>;

export const ApiGraduationPreparationSchema = z.object({
  transaction: Transaction,
  expiresAt: z.string().datetime(),
});
