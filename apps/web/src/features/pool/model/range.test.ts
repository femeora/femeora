import assert from 'node:assert/strict';
import test from 'node:test';

import { binCount, DEFAULT_POSITION_PRESET_ID, fitRangeToBinLimit, PRESETS, snapRangeBound } from './range';

test('defaults to a two-sided range around the active price', () => {
  const preset = PRESETS.find(item => item.id === DEFAULT_POSITION_PRESET_ID);
  assert.equal(preset?.id, 'fee-farm');
  assert.ok((preset?.minPct ?? 0) < 0);
  assert.ok((preset?.maxPct ?? 0) > 0);
});

test('keeps the active price centered inside every preset range', () => {
  for (const preset of PRESETS) {
    assert.equal(preset.minPct, -20, `${preset.id} min`);
    assert.equal(preset.maxPct, 20, `${preset.id} max`);
  }
});

test('fits presets to a narrow bin step without losing the active price', () => {
  const fitted = fitRangeToBinLimit({ minPct: -20, maxPct: 20 }, 25);
  assert.deepEqual(fitted, { minPct: -7, maxPct: 8 });
  assert.ok(binCount(fitted, 25) <= 61);
});

test('normalizes chart bounds to whole percentages', () => {
  const range = { minPct: -35, maxPct: -1 };
  const snapped = snapRangeBound(range, 'minPct', -12.4, 100);
  assert.equal(snapped, -12);
  assert.equal(Number.isInteger(snapped), true);
});

test('keeps a dragged range within the 61-bin contract limit', () => {
  const original = { minPct: -1, maxPct: 1 };
  const maxPct = snapRangeBound(original, 'maxPct', 900, 100);
  const adjusted = { ...original, maxPct };
  assert.ok(binCount(adjusted, 100) <= 61);
});

test('does not allow either handle to cross the opposite handle', () => {
  const range = { minPct: -10, maxPct: 10 };
  assert.ok(snapRangeBound(range, 'minPct', 50, 100) < range.maxPct);
  assert.ok(snapRangeBound(range, 'maxPct', -50, 100) > range.minPct);
});
