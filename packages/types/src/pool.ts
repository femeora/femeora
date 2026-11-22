import { z } from 'zod';

export const ShapeTypeSchema = z.enum(['SPOT', 'CURVE', 'BID_ASK', 'CUSTOM']);
export type ShapeType = z.infer<typeof ShapeTypeSchema>;

export const PoolTypeSchema = z.enum(['DLMM', 'DAMM']);
export type PoolType = z.infer<typeof PoolTypeSchema>;

export const PositionStatusSchema = z.enum(['IN_RANGE', 'OUT_OF_RANGE', 'CLOSED', 'TRANSFERRED']);
export type PositionStatus = z.infer<typeof PositionStatusSchema>;

export const PoolSummarySchema = z.object({
  id: z.string().uuid(),
  chainId: z.number().int(),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  type: PoolTypeSchema,
  tokenX: z.string(),
  tokenY: z.string(),
  quoteToken: z.string(),
  binStep: z.number().int(),
  baseFeeBps: z.number().int(),
  activeBinId: z.number().int().optional(),
  currentPrice: z.number().nonnegative(),
  mcap: z.number().nonnegative().optional(),
  tvlUsd: z.number().nonnegative(),
  volume24h: z.number().nonnegative(),
  fee24h: z.number().nonnegative(),
});
export type PoolSummary = z.infer<typeof PoolSummarySchema>;
