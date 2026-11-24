import assert from 'node:assert/strict';
import test from 'node:test';

import { positionDraftReducer, type PositionDraft } from './usePositionDraft';

const feeFarmDraft: PositionDraft = {
  shape: 'curve',
  minPct: -20,
  maxPct: 20,
  presetId: 'fee-farm',
  quoteAmount: '',
  baseAmount: '',
  postAsCallout: false,
  caption: '',
  showSize: true,
};

test('retains the selected preset when a range handle changes', () => {
  const changed = positionDraftReducer(feeFarmDraft, {
    type: 'range',
    bound: 'minPct',
    value: -12,
  });
  assert.equal(changed.minPct, -12);
  assert.equal(changed.presetId, 'fee-farm');
});

test('retains the selected preset when its shape is replaced manually', () => {
  const changed = positionDraftReducer(feeFarmDraft, { type: 'shape', shape: 'spot' });
  assert.equal(changed.shape, 'spot');
  assert.equal(changed.presetId, 'fee-farm');
});
