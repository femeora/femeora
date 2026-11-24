import assert from 'node:assert/strict';
import test from 'node:test';

import { binCount, snapRangeBound } from './range';

test('snaps chart bounds to the pool bin grid', () => {
  const range = { minPct: -35, maxPct: -1 };
  const snapped = snapRangeBound(range, 'minPct', -12.4, 100);
  const offset = Math.log1p(snapped / 100) / Math.log1p(0.01);
  assert.ok(Math.abs(offset - Math.round(offset)) < 1e-5);
});

test('keeps a dragged range within the 61-bin contract limit', () => {
  const original = { minPct: -1, maxPct: 1 };
  const maxPct = snapRangeBound(original, 'maxPct', 900, 100);
  const adjusted = { ...original, maxPct };
  assert.ok(binCount(adjusted, 100) <= 60);
});

test('does not allow either handle to cross the opposite handle', () => {
  const range = { minPct: -10, maxPct: 10 };
  assert.ok(snapRangeBound(range, 'minPct', 50, 100) < range.maxPct);
  assert.ok(snapRangeBound(range, 'maxPct', -50, 100) > range.minPct);
});
