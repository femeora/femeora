import assert from 'node:assert/strict';
import test from 'node:test';

import { safeIndexerErrorCode } from './worker.js';

test('only controlled error codes can reach logs or health rows', () => {
  assert.equal(safeIndexerErrorCode(new Error('CHAIN_ID_MISMATCH')), 'CHAIN_ID_MISMATCH');
  assert.equal(
    safeIndexerErrorCode(new Error('request failed https://user:secret@rpc.example')),
    'INDEXER_CYCLE_FAILED',
  );
  assert.equal(safeIndexerErrorCode({ url: 'postgresql://secret' }), 'INDEXER_CYCLE_FAILED');
});
