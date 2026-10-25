import test from 'node:test';
import assert from 'node:assert/strict';
import { experienceTimeTicks } from '../js/chart.js';

test('early experience replay labels each available minute once', () => {
  assert.deepEqual(experienceTimeTicks(0, 0, 248), [0]);
  assert.deepEqual(experienceTimeTicks(0, 1, 248), [0, 1]);
  assert.deepEqual(experienceTimeTicks(0, 2, 248), [0, 1, 2]);
});

test('mobile and desktop labels keep endpoints, unique samples and readable spacing', () => {
  for (const width of [200, 248, 284, 320, 650, 1100]) {
    for (const start of [0, 150]) {
      for (let length = 1; length <= 2000; length++) {
        const ticks = experienceTimeTicks(start, start + length, width);
        assert.equal(ticks[0], start);
        assert.equal(ticks.at(-1), start + length);
        assert.equal(new Set(ticks).size, ticks.length);
        for (let k = 1; k < ticks.length; k++) {
          // HH:mm labels are <40px; reserve at least 75px including edge alignment.
          assert.ok((ticks[k] - ticks[k - 1]) / length * width >= 75);
        }
      }
    }
  }
});
