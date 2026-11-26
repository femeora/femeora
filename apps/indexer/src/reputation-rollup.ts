import { prisma, Prisma } from '@fomeora/database';
import { computeLaunchpadReputation, LAUNCHPAD_REPUTATION_CONFIG } from '@fomeora/sdk';

const ROLLUP_INTERVAL_MS = 10 * 60_000;
const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1_000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;
const WINDOWS = [
  { name: '7d', milliseconds: SEVEN_DAYS_MS },
  { name: 'all', milliseconds: null },
] as const;

const decimalUnits = (raw: Prisma.Decimal, decimals: number) =>
  Number(raw.div(new Prisma.Decimal(10).pow(decimals)).toString());

const percentage = (numerator: number, denominator: number) =>
  denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(2));

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

export async function rollupLaunchpadReputation(
  chainId: number,
  now = new Date()
): Promise<{ launchpads: number; rows: number }> {
  const health = await prisma.indexerHealth.findUnique({
    where: { chainId },
    select: { lastReputationRollupAt: true },
  });
  if (
    health?.lastReputationRollupAt &&
    now.getTime() - health.lastReputationRollupAt.getTime() < ROLLUP_INTERVAL_MS
  )
    return { launchpads: 0, rows: 0 };

  const launchpads = await prisma.launchpad.findMany({
    where: { chainId, canonical: true },
    include: {
      launches: {
        where: { canonical: true },
        include: {
          trades: { where: { canonical: true }, orderBy: { timestamp: 'asc' } },
          graduation: true,
          revenue: { where: { canonical: true } },
        },
      },
    },
  });
  const quoteAssets = await prisma.assetCatalog.findMany({
    where: {
      chainId,
      address: { in: [...new Set(launchpads.map(item => item.quoteToken.toLowerCase()))] },
    },
    select: { address: true, decimals: true },
  });
  const decimalsByToken = new Map(
    quoteAssets.map(asset => [asset.address.toLowerCase(), asset.decimals])
  );
  const poolAddresses = launchpads.flatMap(item =>
    item.launches.flatMap(launch => launch.graduation?.pool.toLowerCase() ?? [])
  );
  const pools =
    poolAddresses.length === 0
      ? []
      : await prisma.pool.findMany({
          where: { chainId, canonical: true, address: { in: poolAddresses } },
          include: { swaps: { where: { canonical: true } } },
        });
  const poolByAddress = new Map(pools.map(pool => [pool.address.toLowerCase(), pool]));
  const rows: Prisma.LaunchpadReputationCreateManyInput[] = [];

  for (const launchpad of launchpads) {
    const quote = launchpad.quoteToken.toLowerCase();
    const quoteDecimals = decimalsByToken.get(quote) ?? 18;
    const protectionScore =
      (launchpad.protectionEnabled ? 25 : 0) +
      (launchpad.xRequired ? 25 : 0) +
      (launchpad.devBuyCapPips > 0 && launchpad.earlyBuyCapPips > 0 ? 25 : 0) +
      (launchpad.admins.length === 0 ? 25 : 0);

    for (const window of WINDOWS) {
      const cutoff =
        window.milliseconds === null ? null : new Date(now.getTime() - window.milliseconds);
      const launches = launchpad.launches.filter(launch => !cutoff || launch.createdAt >= cutoff);
      const eligible = launches.filter(
        launch => now.getTime() - launch.createdAt.getTime() >= SEVENTY_TWO_HOURS_MS
      );
      const graduated = eligible.filter(launch => launch.graduation?.canonical === true);
      const matureGraduations = graduated.filter(
        launch =>
          launch.graduation?.canonical &&
          now.getTime() - launch.graduation.timestamp.getTime() >= SEVEN_DAYS_MS
      );
      const survived = matureGraduations.filter(launch => {
        const graduation = launch.graduation;
        if (!graduation?.canonical) return false;
        const pool = poolByAddress.get(graduation.pool.toLowerCase());
        if (!pool || !pool.reserveX || !pool.reserveY) return false;
        const quoteReserveRaw = pool.tokenX.toLowerCase() === quote ? pool.reserveX : pool.reserveY;
        const quoteReserve = decimalUnits(quoteReserveRaw, quoteDecimals);
        return (
          quoteReserve >= LAUNCHPAD_REPUTATION_CONFIG.survivalLiquidityFloorQuote &&
          pool.swaps.some(swap => swap.timestamp >= graduation.timestamp)
        );
      });
      const graduationSeconds = graduated.flatMap(launch =>
        launch.graduation
          ? [(launch.graduation.timestamp.getTime() - launch.createdAt.getTime()) / 1_000]
          : []
      );
      const devExits = launches.filter(launch => {
        const deadline = launch.createdAt.getTime() + 24 * 60 * 60 * 1_000;
        const creator = launch.creator.toLowerCase();
        const creatorTrades = launch.trades.filter(
          trade => trade.trader.toLowerCase() === creator && trade.timestamp.getTime() <= deadline
        );
        const bought = creatorTrades
          .filter(trade => trade.side === 'buy')
          .reduce((sum, trade) => sum.add(trade.tokenAmount), new Prisma.Decimal(0));
        const sold = creatorTrades
          .filter(trade => trade.side === 'sell')
          .reduce((sum, trade) => sum.add(trade.tokenAmount), new Prisma.Decimal(0));
        return bought.greaterThan(0) && sold.greaterThan(bought.mul('0.5'));
      }).length;
      let earlyTopFiveTokens = new Prisma.Decimal(0);
      let totalSupply = new Prisma.Decimal(0);
      for (const launch of launches) {
        const earlyEnd = launch.createdAt.getTime() + launchpad.earlyBuyDurationSeconds * 1_000;
        const byWallet = new Map<string, Prisma.Decimal>();
        for (const trade of launch.trades) {
          if (trade.side !== 'buy' || trade.timestamp.getTime() > earlyEnd) continue;
          const wallet = trade.recipient.toLowerCase();
          byWallet.set(
            wallet,
            (byWallet.get(wallet) ?? new Prisma.Decimal(0)).add(trade.tokenAmount)
          );
        }
        const topFive = [...byWallet.values()]
          .sort((left, right) => right.comparedTo(left))
          .slice(0, 5)
          .reduce((sum, amount) => sum.add(amount), new Prisma.Decimal(0));
        earlyTopFiveTokens = earlyTopFiveTokens.add(topFive);
        totalSupply = totalSupply.add(launch.totalSupply);
      }
      const curveVolumeRaw = launches.reduce(
        (sum, launch) =>
          launch.trades.reduce((tradeSum, trade) => tradeSum.add(trade.quoteAmount), sum),
        new Prisma.Decimal(0)
      );
      const postGraduationVolumeRaw = launches.reduce((sum, launch) => {
        const graduation = launch.graduation;
        if (!graduation?.canonical) return sum;
        const pool = poolByAddress.get(graduation.pool.toLowerCase());
        if (!pool) return sum;
        return pool.swaps
          .filter(swap => !cutoff || swap.timestamp >= cutoff)
          .reduce((swapSum, swap) => {
            const quoteAmount =
              swap.tokenIn.toLowerCase() === quote ? swap.amountIn : swap.amountOut;
            return swapSum.add(quoteAmount);
          }, sum);
      }, new Prisma.Decimal(0));
      const revenueRaw = launches.reduce(
        (sum, launch) =>
          launch.revenue
            .filter(item => item.category === 'launchpad' && item.token.toLowerCase() === quote)
            .filter(item => !cutoff || item.timestamp >= cutoff)
            .reduce((revenueSum, item) => revenueSum.add(item.amount), sum),
        new Prisma.Decimal(0)
      );
      const metrics = {
        launches: launches.length,
        graduationRate: percentage(graduated.length, eligible.length),
        survivalRate: percentage(survived.length, matureGraduations.length),
        medianTimeToGraduateSeconds: median(graduationSeconds),
        devExitRate: percentage(devExits, launches.length),
        sniperShare: totalSupply.isZero()
          ? 0
          : Number(earlyTopFiveTokens.div(totalSupply).mul(100).toFixed(2)),
        volumeQuote: decimalUnits(curveVolumeRaw.add(postGraduationVolumeRaw), quoteDecimals),
        revenueQuote: decimalUnits(revenueRaw, quoteDecimals),
        protectionScore,
      };
      const reputation = computeLaunchpadReputation(metrics);
      rows.push({
        chainId,
        launchpadId: launchpad.launchpadId,
        window: window.name,
        launches: launches.length,
        eligibleLaunches: eligible.length,
        graduations: graduated.length,
        survivedGraduations: survived.length,
        graduationRate: metrics.graduationRate,
        survivalRate: metrics.survivalRate,
        medianTimeToGraduate:
          metrics.medianTimeToGraduateSeconds === null
            ? null
            : BigInt(Math.round(metrics.medianTimeToGraduateSeconds)),
        devExitRate: metrics.devExitRate,
        sniperShare: metrics.sniperShare,
        volumeQuote: metrics.volumeQuote.toFixed(18),
        revenueQuote: metrics.revenueQuote.toFixed(18),
        protectionScore,
        score: reputation.score,
        tier: reputation.tier,
        computedAt: now,
      });
    }
  }

  await prisma.$transaction(async transaction => {
    await transaction.launchpadReputation.deleteMany({ where: { chainId } });
    if (rows.length > 0) await transaction.launchpadReputation.createMany({ data: rows });
    await transaction.indexerHealth.update({
      where: { chainId },
      data: { lastReputationRollupAt: now },
    });
  });
  return { launchpads: launchpads.length, rows: rows.length };
}
