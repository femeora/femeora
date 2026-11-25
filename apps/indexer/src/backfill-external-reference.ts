import { prisma } from '@fomeora/database';

import { backfillExternalReferenceCandles } from './external-reference.js';

const rawDays = process.argv.find(value => value.startsWith('--days='))?.slice(7) ?? '30';
const days = Number(rawDays);

try {
  if (!Number.isSafeInteger(days) || days < 1 || days > 365) throw new Error('INVALID_BACKFILL_DAYS');
  const result = await backfillExternalReferenceCandles(days);
  // Public progress deliberately excludes database and provider credentials.
  // eslint-disable-next-line no-console
  console.info(`External reference history complete days=${days} pools=${result.pools} candles=${result.candles}`);
} catch (error) {
  const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,79}$/.test(error.message)
    ? error.message
    : 'EXTERNAL_REFERENCE_BACKFILL_FAILED';
  // eslint-disable-next-line no-console
  console.error(`External reference history failed code=${code}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
