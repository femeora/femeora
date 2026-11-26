import { z } from 'zod';

import { PositionStatusSchema, ShapeTypeSchema } from './pool.js';
import { ApiCalloutSchema } from './api-pools.js';

// Anti-shill & Security validation: Caption rules
// - Max 280 chars
// - No raw URLs (anti-phishing)
// - No raw EVM addresses / contract addresses
export const CalloutCaptionSchema = z
  .string()
  .max(280, 'Caption exceeds 280 characters')
  .refine(val => !/https?:\/\/[^\s]+/i.test(val), {
    message: 'Links/URLs are not allowed in callout captions',
  })
  .refine(val => !/0x[a-fA-F0-9]{40}/.test(val), {
    message: 'Direct wallet or contract addresses are not allowed',
  });

export const AntiShillBadgeSchema = z.object({
  quickExit: z.boolean().default(false), // Removed >= 50% within 30 min
  quickExitMinutes: z.number().nullable().optional(),
  hasOppositeSide: z.boolean().nullable(), // Caller holds opposite-side liquidity >= 50%
  isDevOrTopHolder: z.boolean().nullable(),
  isFreshWallet: z.boolean().nullable(), // Linked wallet age < 7 days
  inRangePercentage: z.number().min(0).max(100),
  heldDurationSeconds: z.number().nonnegative(),
});
export type AntiShillBadge = z.infer<typeof AntiShillBadgeSchema>;

export const CalloutCardDTO = z.object({
  id: z.string().uuid(),
  user: z.object({
    id: z.string().uuid(),
    handle: z.string(),
    name: z.string(),
    avatarUrl: z.string().url(),
    isXVerified: z.boolean(),
    isTop10: z.boolean().default(false),
  }),
  caption: z.string().nullable(),
  isCaptionEdited: z.boolean().default(false),
  tokenSymbol: z.string(),
  poolType: z.enum(['DLMM', 'DAMM']),
  shape: ShapeTypeSchema,
  side: z.enum(['SINGLE_SIDE_QUOTE', 'SINGLE_SIDE_TOKEN', 'TWO_SIDED']),
  status: PositionStatusSchema,
  positionValueUsd: z.number(),
  earnedUsd: z.number(),
  profitUsd: z.number(),
  tokenMcapNow: z.number(),
  mcapAtPost: z.number(),
  tailersCount: z.number().int().nonnegative(),
  antiShill: AntiShillBadgeSchema,
  showSize: z.boolean().default(true),
  createdAt: z.string().datetime(),
  likesCount: z.number().int().nonnegative(),
  repostsCount: z.number().int().nonnegative(),
  repliesCount: z.number().int().nonnegative(),
  viewsCount: z.number().int().nonnegative(),
});
export type CalloutCard = z.infer<typeof CalloutCardDTO>;

export const ApiNotificationSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  payload: z.record(z.unknown()),
  actor: z.object({
    handle: z.string(),
    name: z.string().nullable(),
    avatarUrl: z.string().url().nullable(),
    xVerified: z.boolean(),
  }).nullable(),
  createdAt: z.string().datetime(),
  readAt: z.string().datetime().nullable(),
});
export type ApiNotification = z.infer<typeof ApiNotificationSchema>;

export const ApiNotificationListSchema = z.object({
  data: z.array(ApiNotificationSchema),
  nextCursor: z.string().uuid().nullable(),
});

export const ApiNotificationReadSchema = z.object({ read: z.literal(true) });

export const ApiUserProfileSchema = z.object({
  user: z.object({
    id: z.string().uuid(), handle: z.string(), name: z.string().nullable(),
    avatarUrl: z.string().url().nullable(), xVerified: z.boolean(),
    xFollowers: z.number().int().nonnegative().nullable(), createdAt: z.string().datetime(),
    followers: z.number().int().nonnegative(), following: z.number().int().nonnegative(),
    callouts: z.number().int().nonnegative(), followedByMe: z.boolean(),
  }),
  stats: z.array(z.object({
    window: z.string(), callouts: z.number().int().nonnegative(), earnedQuote: z.string(),
    avgInRange: z.string(), tailers: z.number().int().nonnegative(),
    quickExits: z.number().int().nonnegative(), score: z.string(),
    rank: z.number().int().nonnegative(), updatedAt: z.string().datetime(),
  })),
  trackRecord: z.object({
    openCallouts: z.number().int().nonnegative(), closedCallouts: z.number().int().nonnegative(),
    averageHoldSeconds: z.number().int().nonnegative(), quickExits: z.number().int().nonnegative(),
    medianInRange: z.number().min(0).max(100),
  }),
  callouts: z.array(ApiCalloutSchema),
});
export type ApiUserProfile = z.infer<typeof ApiUserProfileSchema>;
