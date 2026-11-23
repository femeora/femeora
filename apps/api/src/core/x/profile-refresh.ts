import type { PrismaClient } from '@fomeora/database';
import { z } from 'zod';

const profileSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
      username: z.string().min(1).max(50),
      name: z.string().nullable().optional(),
      profile_image_url: z.string().url().nullable().optional(),
      verified: z.boolean().optional(),
      public_metrics: z.object({ followers_count: z.number().int().nonnegative() }).optional(),
    }),
  ).default([]),
});

const BATCH_SIZE = 100;
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1_000;

export type RefreshXProfilesResult = {
  requests: number;
  selected: number;
  updated: number;
  conflicts: number;
};

export async function refreshXProfiles(options: {
  prisma: PrismaClient;
  bearerToken: string;
  maxRequests?: number;
  now?: Date;
  fetcher?: typeof fetch;
}): Promise<RefreshXProfilesResult> {
  const maxRequests = Math.min(Math.max(options.maxRequests ?? 10, 1), 10);
  const now = options.now ?? new Date();
  const staleBefore = new Date(now.getTime() - REFRESH_INTERVAL_MS);
  const fetcher = options.fetcher ?? fetch;
  const result: RefreshXProfilesResult = { requests: 0, selected: 0, updated: 0, conflicts: 0 };

  while (result.requests < maxRequests) {
    const users = await options.prisma.user.findMany({
      where: {
        OR: [{ xProfileRefreshedAt: null }, { xProfileRefreshedAt: { lt: staleBefore } }],
      },
      orderBy: [{ xProfileRefreshedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
      take: BATCH_SIZE,
      select: { id: true, xId: true },
    });
    if (users.length === 0) break;
    result.requests += 1;
    result.selected += users.length;

    const endpoint = new URL('https://api.x.com/2/users');
    endpoint.searchParams.set('ids', users.map(user => user.xId).join(','));
    endpoint.searchParams.set('user.fields', 'profile_image_url,public_metrics,verified');
    const response = await fetcher(endpoint, {
      headers: { authorization: `Bearer ${options.bearerToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`X profile refresh failed with status ${response.status}`);
    const parsed = profileSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('X profile refresh returned an invalid response');

    const profiles = new Map(parsed.data.data.map(profile => [profile.id, profile]));
    for (const user of users) {
      const profile = profiles.get(user.xId);
      if (!profile) {
        await options.prisma.user.update({
          where: { id: user.id },
          data: { xProfileRefreshedAt: now },
        });
        continue;
      }
      try {
        await options.prisma.user.update({
          where: { id: user.id },
          data: {
            handle: profile.username,
            name: profile.name ?? null,
            avatarUrl: profile.profile_image_url ?? null,
            xVerified: profile.verified ?? false,
            xFollowers: profile.public_metrics?.followers_count ?? 0,
            xProfileRefreshedAt: now,
          },
        });
        result.updated += 1;
      } catch (error) {
        const uniqueConflict =
          typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
        if (!uniqueConflict) throw error;
        result.conflicts += 1;
        await options.prisma.user.update({
          where: { id: user.id },
          data: {
            name: profile.name ?? null,
            avatarUrl: profile.profile_image_url ?? null,
            xVerified: profile.verified ?? false,
            xFollowers: profile.public_metrics?.followers_count ?? 0,
            xProfileRefreshedAt: now,
          },
        });
      }
    }

    if (users.length < BATCH_SIZE) break;
  }

  return result;
}
