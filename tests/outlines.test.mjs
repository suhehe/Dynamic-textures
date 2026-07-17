import assert from 'node:assert/strict';
import { getOutlinesBlurOffsets, getOutlinesBlurPassCount } from '../src/outlines.ts';

assert.deepEqual([3, 5, 7, 9].map(getOutlinesBlurPassCount), [1, 2, 3, 4]);

for (const samples of [3, 5, 7, 9]) {
  const offsets = getOutlinesBlurOffsets(5, samples);
  assert.equal(offsets.length, getOutlinesBlurPassCount(samples));
  assert.ok(offsets.every(Number.isFinite));
  assert.ok(offsets.every((value, index) => index === 0 || value > offsets[index - 1]));
  assert.ok(Math.abs(Math.hypot(...offsets) - 65) < 1e-10);
}

assert.deepEqual(getOutlinesBlurOffsets(0, 9), [0, 0, 0, 0]);
