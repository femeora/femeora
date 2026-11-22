import { z } from 'zod';

import { PositionStatusSchema, ShapeTypeSchema } from './pool.js';

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
  quickExitMinutes: z.number().optional(),
  hasOppositeSide: z.boolean().default(false), // Caller holds opposite-side liquidity >= 50%
  isDevOrTopHolder: z.boolean().default(false),
  isFreshWallet: z.boolean().default(false), // Linked wallet age < 7 days
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
