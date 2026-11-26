import assert from 'node:assert/strict';
import test from 'node:test';

import { computeLaunchpadReputation } from './reputation.js';

const strongHistory = {
  launches: 20,
  graduationRate: 100,
  survivalRate: 100,
  medianTimeToGraduateSeconds: 24 * 60 * 60,
  devExitRate: 0,
  sniperShare: 0,
  volumeQuote: 50_000,
  revenueQuote: 1_000,
  protectionScore: 100,
};

test('keeps launchpads unrated until five canonical launches', () => {
  assert.equal(computeLaunchpadReputation({ ...strongHistory, launches: 4 }).tier, 'Unrated');
});

test('awards Verified only for a mature, fully protected history', () => {
  assert.deepEqual(computeLaunchpadReputation(strongHistory), {
    score: 100,
    tier: 'Verified',
  });
  assert.notEqual(
    computeLaunchpadReputation({ ...strongHistory, protectionScore: 75 }).tier,
    'Verified'
  );
});

test('subtracts developer-exit and early concentration penalties', () => {
  const clean = computeLaunchpadReputation(strongHistory).score;
  const penalized = computeLaunchpadReputation({
    ...strongHistory,
    devExitRate: 100,
    sniperShare: 100,
  }).score;
  assert.equal(clean - penalized, 10);
});
