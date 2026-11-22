import { calculatePositionFeeShare } from './processors/swap-processor.js';

export async function runIndexer() {
  // eslint-disable-next-line no-console
  console.info('Fomeora Indexer service initializing...');
}

if (process.env.NODE_ENV !== 'test') {
  void runIndexer();
}

export { calculatePositionFeeShare };
