process.env.NODE_ENV = 'test';

const { prisma } = await import('@fomeora/database');
const { loadIndexerEnvironment } = await import('@fomeora/env');
const { computeLaunchpadReputation } = await import('@fomeora/sdk');
const { rollupLaunchpadReputation } = await import('../src/reputation-rollup.js');

const environment = loadIndexerEnvironment();
const now = new Date();

try {
  await prisma.indexerHealth.update({
    where: { chainId: environment.CHAIN_ID },
    data: { lastReputationRollupAt: null },
  });
  await rollupLaunchpadReputation(environment.CHAIN_ID, now);
  const rows = await prisma.launchpadReputation.findMany({
    where: { chainId: environment.CHAIN_ID },
    include: {
      launchpad: {
        include: {
          launches: {
            where: { canonical: true },
            include: { graduation: true },
          },
        },
      },
    },
  });
  const checks = rows.map(row => {
    const cutoff = row.window === '7d' ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000) : null;
    const launches = row.launchpad.launches.filter(launch => !cutoff || launch.createdAt >= cutoff);
    const eligible = launches.filter(
      launch => now.getTime() - launch.createdAt.getTime() >= 72 * 60 * 60 * 1_000
    );
    const graduations = eligible.filter(launch => launch.graduation?.canonical === true);
    const recomputed = computeLaunchpadReputation({
      launches: row.launches,
      graduationRate: row.graduationRate.toNumber(),
      survivalRate: row.survivalRate.toNumber(),
      medianTimeToGraduateSeconds:
        row.medianTimeToGraduate === null ? null : Number(row.medianTimeToGraduate),
      devExitRate: row.devExitRate.toNumber(),
      sniperShare: row.sniperShare.toNumber(),
      volumeQuote: row.volumeQuote.toNumber(),
      revenueQuote: row.revenueQuote.toNumber(),
      protectionScore: row.protectionScore.toNumber(),
    });
    return {
      launchpadId: row.launchpadId.toString(),
      window: row.window,
      sourceCountsMatch:
        row.launches === launches.length &&
        row.eligibleLaunches === eligible.length &&
        row.graduations === graduations.length,
      scoreMatches: row.score.toNumber() === recomputed.score && row.tier === recomputed.tier,
      fresh: now.getTime() - row.computedAt.getTime() <= 15 * 60 * 1_000,
    };
  });
  // Public chain-derived identifiers and booleans only; no credentials are logged.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ rows: checks.length, checks }));
  if (
    rows.length === 0 ||
    checks.some(check => !check.sourceCountsMatch || !check.scoreMatches || !check.fresh)
  )
    throw new Error('REPUTATION_VERIFICATION_FAILED');
} catch {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ error: 'REPUTATION_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
