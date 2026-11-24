import { prisma } from '@fomeora/database';
import { loadIndexerEnvironment } from '@fomeora/env';

import { createIndexerClient } from './chain-client.js';
import { runIndexerCycle, safeIndexerErrorCode } from './worker.js';

const environment = loadIndexerEnvironment();
const client = createIndexerClient(environment);

try {
  const result = await runIndexerCycle(environment, client);
  // eslint-disable-next-line no-console
  console.info(
    `Fomeora Indexer sync complete chain=${result.chainId} indexed=${result.toBlock} safe=${result.safeBlock} lag=${result.lagBlocks} batches=${result.batches} pools=${result.pools} bins=${result.bins} binFees=${result.binFees} swaps=${result.swaps} positions=${result.positionEvents} valuePools=${result.valuePools} valuePositions=${result.valuePositions} referencePools=${result.referencePools} referenceCandles=${result.referenceCandles} statsUsers=${result.statsUsers} statsRows=${result.statsRows}`,
  );
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(`Fomeora Indexer sync failed code=${safeIndexerErrorCode(error)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
