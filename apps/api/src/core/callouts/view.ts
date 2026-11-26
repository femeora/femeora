import { prisma, Prisma } from '@fomeora/database';
import { classifyRangeSide } from '@fomeora/sdk';

export const visibleCalloutWhere = {
  canonical: true,
  hidden: false,
  deletedAt: null,
  status: 'live',
} satisfies Prisma.CalloutWhereInput;

export const calloutInclude = {
  user: {
    select: {
      id: true,
      handle: true,
      name: true,
      avatarUrl: true,
      xVerified: true,
    },
  },
  pool: {
    select: {
      address: true,
      type: true,
      tokenX: true,
      tokenY: true,
      quoteToken: true,
      binStep: true,
      initialActiveBin: true,
      activeBin: true,
      referenceCandles: {
        where: { interval: '1h' },
        orderBy: { bucketStart: 'desc' },
        take: 1,
        select: { close: true },
      },
    },
  },
  position: {
    select: {
      id: true,
      owner: true,
      status: true,
      depositedQuote: true,
      withdrawnQuote: true,
      earnedQuote: true,
      valueQuote: true,
      inRangeSeconds: true,
      openSeconds: true,
    },
  },
  updates: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      type: true,
      caption: true,
      createdAt: true,
      positionEvent: {
        select: {
          positionId: true,
          eventType: true,
          payload: true,
          transactionHash: true,
          blockNumber: true,
          timestamp: true,
          canonical: true,
          position: {
            select: {
              owner: true,
              status: true,
              depositedQuote: true,
              withdrawnQuote: true,
              earnedQuote: true,
              valueQuote: true,
              inRangeSeconds: true,
              openSeconds: true,
            },
          },
        },
      },
    },
  },
  replies: {
    where: { hidden: false },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      calloutId: true,
      parentId: true,
      kind: true,
      body: true,
      createdAt: true,
      user: { select: { id: true, handle: true, name: true, avatarUrl: true, xVerified: true } },
    },
  },
  tails: {
    select: {
      chainId: true,
      positionId: true,
      tailerWallet: true,
    },
  },
  _count: { select: { likes: true, reposts: true, tails: true, views: true } },
} satisfies Prisma.CalloutInclude;

export type CalloutView = Prisma.CalloutGetPayload<{ include: typeof calloutInclude }>;

export interface CalloutViewerState {
  liked: boolean;
  reposted: boolean;
  following: boolean;
}

export interface CalloutTailStats {
  tails: number;
  tailedValueQuote: string;
  rewardsActive: boolean;
  rewards: readonly { token: string; amount: string }[];
}

const anonymousViewer: CalloutViewerState = { liked: false, reposted: false, following: false };

type DecimalValue = { toString(): string; toFixed?(): string };

function decimalString(value: DecimalValue): string {
  return value.toFixed ? value.toFixed() : value.toString();
}

export async function resolveCalloutViewerStates(
  userId: string | undefined,
  callouts: readonly CalloutView[]
) {
  const states = new Map<string, CalloutViewerState>();
  for (const callout of callouts) states.set(callout.id, { ...anonymousViewer });
  if (!userId || callouts.length === 0) return states;
  const calloutIds = callouts.map(callout => callout.id);
  const authorIds = [...new Set(callouts.map(callout => callout.userId))];
  const [likes, reposts, follows] = await Promise.all([
    prisma.like.findMany({
      where: { userId, calloutId: { in: calloutIds } },
      select: { calloutId: true },
    }),
    prisma.repost.findMany({
      where: { userId, calloutId: { in: calloutIds } },
      select: { calloutId: true },
    }),
    prisma.follow.findMany({
      where: { followerId: userId, followeeId: { in: authorIds } },
      select: { followeeId: true },
    }),
  ]);
  const liked = new Set(likes.map(row => row.calloutId));
  const reposted = new Set(reposts.map(row => row.calloutId));
  const followed = new Set(follows.map(row => row.followeeId));
  for (const callout of callouts)
    states.set(callout.id, {
      liked: liked.has(callout.id),
      reposted: reposted.has(callout.id),
      following: followed.has(callout.userId),
    });
  return states;
}

/**
 * Resolves current tail-position value and canonical on-chain rewards in batched
 * queries. Reward rows are sourced exclusively from TailFeesDistributed events.
 */
export async function resolveCalloutTailStats(
  callouts: readonly CalloutView[]
): Promise<Map<string, CalloutTailStats>> {
  const keys = callouts.flatMap(callout =>
    callout.tails.map(tail => ({
      chainId: tail.chainId,
      id: tail.positionId,
    }))
  );
  const sourceKeys = callouts.map(callout => ({
    chainId: callout.chainId,
    referrerPositionId: callout.position.id,
  }));
  const [positions, rewardRows, rewardEventCount] = await Promise.all([
    keys.length === 0
      ? Promise.resolve([])
      : prisma.position.findMany({
          where: { OR: keys },
          select: { chainId: true, id: true, valueQuote: true },
        }),
    sourceKeys.length === 0
      ? Promise.resolve([])
      : prisma.tailReward.findMany({
          where: { OR: sourceKeys, canonical: true, eligible: true, rewardAmount: { gt: 0 } },
          select: { chainId: true, referrerPositionId: true, token: true, rewardAmount: true },
        }),
    prisma.tailReward.count({ where: { canonical: true } }),
  ]);
  const valueByPosition = new Map(
    positions.map(position => [
      `${position.chainId}:${position.id.toString()}`,
      position.valueQuote ?? new Prisma.Decimal(0),
    ])
  );
  const rewardsBySource = new Map<string, Map<string, Prisma.Decimal>>();
  for (const reward of rewardRows) {
    const key = `${reward.chainId}:${reward.referrerPositionId.toString()}`;
    const byToken = rewardsBySource.get(key) ?? new Map<string, Prisma.Decimal>();
    byToken.set(reward.token, (byToken.get(reward.token) ?? new Prisma.Decimal(0)).add(reward.rewardAmount));
    rewardsBySource.set(key, byToken);
  }
  const rewardsActive = rewardEventCount > 0;
  return new Map(
    callouts.map(callout => {
      const tailedValue = callout.tails.reduce(
        (sum, tail) =>
          sum.add(valueByPosition.get(`${tail.chainId}:${tail.positionId.toString()}`) ?? 0),
        new Prisma.Decimal(0)
      );
      const rewards = [...(rewardsBySource.get(`${callout.chainId}:${callout.position.id.toString()}`) ?? new Map())]
        .map(([token, amount]) => ({ token, amount: amount.toFixed(0) }));
      return [
        callout.id,
        {
          tails: callout.tails.length,
          tailedValueQuote: tailedValue.toFixed(),
          rewardsActive,
          rewards,
        },
      ];
    })
  );
}

export function serializeCallout(
  callout: CalloutView,
  score: string | null = null,
  viewer: CalloutViewerState = anonymousViewer,
  tailStats?: CalloutTailStats
) {
  const latestRebalance = [...callout.updates]
    .reverse()
    .find(update => update.type === 'Rebalanced' && update.positionEvent.canonical);
  const effectivePosition = latestRebalance?.positionEvent.position ?? callout.position;
  const rebalancePayload = latestRebalance?.positionEvent.payload;
  const payload =
    rebalancePayload && typeof rebalancePayload === 'object' && !Array.isArray(rebalancePayload)
      ? (rebalancePayload as Record<string, Prisma.JsonValue>)
      : null;
  const replacementLowerBin = typeof payload?.lowerBin === 'number' ? payload.lowerBin : null;
  const replacementUpperBin = typeof payload?.upperBin === 'number' ? payload.upperBin : null;
  const replacementShape = typeof payload?.shape === 'number' ? payload.shape : null;
  const openSeconds = Number(effectivePosition.openSeconds);
  const inRangePercentage =
    openSeconds === 0
      ? 0
      : Math.min(100, (Number(effectivePosition.inRangeSeconds) / openSeconds) * 100);
  const { referenceCandles, ...pool } = callout.pool;
  return {
    id: callout.id,
    kind: callout.kind === 'launch_lp' ? ('launch_lp' as const) : ('position' as const),
    launchId: callout.launchId?.toString() ?? null,
    chainId: callout.chainId,
    positionId: (latestRebalance?.positionEvent.positionId ?? callout.positionId).toString(),
    caption: callout.caption,
    captionEditedAt: callout.captionEditedAt?.toISOString() ?? null,
    showSize: callout.showSize,
    mcAtPost: callout.mcAtPost ? decimalString(callout.mcAtPost) : null,
    priceAtPost: callout.priceAtPost ? decimalString(callout.priceAtPost) : null,
    sizeAtPost: callout.sizeAtPost ? decimalString(callout.sizeAtPost) : null,
    side:
      replacementLowerBin !== null &&
      replacementUpperBin !== null &&
      callout.pool.activeBin !== null
        ? classifyRangeSide(replacementLowerBin, replacementUpperBin, callout.pool.activeBin)
        : callout.side,
    shape: replacementShape ?? callout.shape,
    lowerBin: replacementLowerBin ?? callout.lowerBin,
    upperBin: replacementUpperBin ?? callout.upperBin,
    createdAt: callout.createdAt.toISOString(),
    score,
    antiShill: {
      quickExit: callout.quickExitMinutes !== null,
      quickExitMinutes: callout.quickExitMinutes,
      hasOppositeSide: callout.hasOppositeSide,
      isDevOrTopHolder: callout.isDevOrTopHolder,
      isFreshWallet: callout.isFreshWallet,
      inRangePercentage,
      heldDurationSeconds: callout.position.openSeconds.toString(),
    },
    user: callout.user,
    pool: {
      ...pool,
      currentPrice: referenceCandles[0]?.close ? decimalString(referenceCandles[0].close) : null,
    },
    position: {
      owner: effectivePosition.owner,
      status: effectivePosition.status,
      depositedQuote: decimalString(effectivePosition.depositedQuote),
      withdrawnQuote: decimalString(effectivePosition.withdrawnQuote),
      earnedQuote: decimalString(effectivePosition.earnedQuote),
      valueQuote: effectivePosition.valueQuote ? decimalString(effectivePosition.valueQuote) : null,
      inRangeSeconds: effectivePosition.inRangeSeconds.toString(),
      openSeconds: effectivePosition.openSeconds.toString(),
    },
    stats: {
      likes: callout._count.likes,
      reposts: callout._count.reposts,
      replies: callout.replies.filter(reply => reply.kind === 'reply').length,
      quotes: callout.replies.filter(reply => reply.kind === 'quote').length,
      views: callout._count.views,
      tails: tailStats?.tails ?? callout._count.tails,
      tailedValueQuote: tailStats?.tailedValueQuote ?? '0',
      rewardsActive: tailStats?.rewardsActive ?? false,
      rewards: tailStats?.rewards ?? [],
    },
    viewer,
    updates: callout.updates
      .filter(update => update.positionEvent.canonical)
      .map(update => ({
        id: update.id,
        type: update.type,
        caption: update.caption,
        positionId: update.positionEvent.positionId.toString(),
        lowerBin:
          typeof update.positionEvent.payload === 'object' &&
          update.positionEvent.payload !== null &&
          !Array.isArray(update.positionEvent.payload) &&
          typeof update.positionEvent.payload.lowerBin === 'number'
            ? update.positionEvent.payload.lowerBin
            : null,
        upperBin:
          typeof update.positionEvent.payload === 'object' &&
          update.positionEvent.payload !== null &&
          !Array.isArray(update.positionEvent.payload) &&
          typeof update.positionEvent.payload.upperBin === 'number'
            ? update.positionEvent.payload.upperBin
            : null,
        transactionHash: update.positionEvent.transactionHash,
        blockNumber: update.positionEvent.blockNumber.toString(),
        timestamp: update.positionEvent.timestamp.toISOString(),
        createdAt: update.createdAt.toISOString(),
      })),
    comments: callout.replies.map(reply => ({
      ...reply,
      kind: reply.kind === 'quote' ? 'quote' : 'reply',
      createdAt: reply.createdAt.toISOString(),
    })),
  };
}
