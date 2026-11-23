import assert from 'node:assert/strict';
import test from 'node:test';

import { computeCalloutScore } from './ranking.js';

test('matches the Best score formula and clamps in-range ratio', () => {
  const score = computeCalloutScore({
    earnedUsdWindow: 10,
    sizeUsd: 100,
    inRangeRatioWindow: 1.5,
    tailersCount: 9,
    hasQuickExit: false,
    hasOppositeSideLiquidity: false,
  });
  assert.equal(score, 0.2);
});

test('applies opposite-side penalty and excludes quick exits', () => {
  const input = {
    earnedUsdWindow: 10,
    sizeUsd: 100,
    inRangeRatioWindow: 1,
    tailersCount: 0,
    hasQuickExit: false,
    hasOppositeSideLiquidity: true,
  };
  assert.equal(computeCalloutScore(input), 0.05);
  assert.equal(computeCalloutScore({ ...input, hasQuickExit: true }), 0);
});
