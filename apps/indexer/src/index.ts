import { prisma } from '@fomeora/database';
import { loadIndexerEnvironment } from '@fomeora/env';

import { calculatePositionFeeShare } from './processors/swap-processor.js';
import { runIndexerWorker } from './worker.js';

export async function runIndexer() {
  const environment = loadIndexerEnvironment();
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await runIndexerWorker(environment, controller.signal);
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await prisma.$disconnect();
  }
}

if (process.env.NODE_ENV !== 'test') {
  void runIndexer().catch(() => {
    // Deliberately omit the raw error: RPC clients may include credential-bearing URLs.
    // eslint-disable-next-line no-console
    console.error('Fomeora Indexer stopped unexpectedly code=INDEXER_WORKER_STOPPED');
    process.exitCode = 1;
  });
}

export { calculatePositionFeeShare };
