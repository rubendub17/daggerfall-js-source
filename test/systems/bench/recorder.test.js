// BENCH1 (2026-10-19) - THE RECORDER'S ARITHMETIC, PINNED BY HAND. A benchmark
// that reports a wrong percentile is worse than one that reports none: a leg
// that reads p99 10 ms when it hitched to 100 ms is the lie the tail exists to
// catch. So every case here is worked out on paper (nearest rank, n-1 frames
// per n stamps, 1000 / p99 for the 1% low) and asserted as an exact number -
// assert.ok(r.fps) would pass on a broken implementation and is not wanted.
// Pure numbers in, pure numbers out: the module imports nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percentile, summarise } from '../../../src/systems/bench/recorder.js';

const RAMP = Array.from({ length: 100 }, (_, k) => k + 1);   // 1..100, ascending

// every derived field a leg must leave null rather than fake with a 0
const DERIVED = ['seconds', 'fps', 'meanMs', 'minMs', 'p50Ms', 'p95Ms', 'p99Ms', 'worstMs', 'lowFps'];

function assertNoMeasurement(r, label) {
  assert.equal(r.frames, 0, `${label}: no frames, and the count of nothing is an honest 0`);
  assert.equal(r.spanMs, 0, `${label}: no span, an honest 0`);
  for (const k of DERIVED) assert.equal(r[k], null, `${label}: ${k} is null, never 0 - a 0 ms row would say the leg was free`);
  assert.ok(!Object.values(r).some((v) => Number.isNaN(v)), `${label}: and never NaN`);
}

test('BENCH1: percentile is nearest rank - on 1..100, p50 is 50, p95 is 95, p99 is 99, p100 is 100, p0 is 1', () => {
  assert.equal(percentile(RAMP, 50), 50, 'ceil(0.50 * 100) - 1 = 49, the 50th value');
  assert.equal(percentile(RAMP, 95), 95, 'ceil(0.95 * 100) - 1 = 94');
  assert.equal(percentile(RAMP, 99), 99, 'ceil(0.99 * 100) - 1 = 98');
  assert.equal(percentile(RAMP, 100), 100, 'the last value');
  assert.equal(percentile(RAMP, 0), 1, 'rank -1 clamps to 0');
  assert.equal(percentile([7], 99), 7, 'one value holds every rank');
  assert.equal(percentile([4, 4, 4], 95), 4, 'a flat leg is flat at every rank');
  // n = 40: p95 -> ceil(38) - 1 = 37 (the 38th), not the 40th
  assert.equal(percentile(Array.from({ length: 40 }, (_, k) => k + 1), 95), 38, 'the rank is the ceil of p*n, not a guess at the index');
});

test('BENCH1: percentile answers null, never NaN, with no rank to give - a non-array, an empty list, a non-finite p, a NaN entry', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile(null, 50), null);
  assert.equal(percentile(undefined, 50), null);
  assert.equal(percentile('1,2,3', 50), null);
  assert.equal(percentile({ length: 3 }, 50), null);
  assert.equal(percentile(RAMP, NaN), null);
  assert.equal(percentile(RAMP, Infinity), null);
  assert.equal(percentile(RAMP, -Infinity), null);
  assert.equal(percentile(RAMP, null), null);
  assert.equal(percentile([1, NaN, 3], 50), null, 'the rank that holds no number answers nothing');
});

test('BENCH1: a two-stamp leg is one frame - 16 ms is 62.5 fps rounded to 63, the 1% low 62.5', () => {
  const r = summarise([1000, 1016]);
  assert.equal(r.frames, 1, 'two stamps hold one frame');
  assert.equal(r.spanMs, 16);
  assert.equal(r.meanMs, 16, 'the span over the one frame');
  assert.equal(r.fps, 63, 'Math.round(1000 / 16), the counter\'s own rounding');
  assert.equal(r.minMs, 16);
  assert.equal(r.p50Ms, 16);
  assert.equal(r.p95Ms, 16);
  assert.equal(r.p99Ms, 16);
  assert.equal(r.worstMs, 16);
  assert.equal(r.lowFps, 62.5, '1000 / p99, exact: one frame is the whole distribution');
  assert.equal(r.seconds, 0.016, 'the span in seconds when the leg gives none');
});

test('BENCH1: a leg of exactly 100 stamps of 16.6667 ms is 99 frames at 60 fps, every percentile 16.6667 ms', () => {
  const stamps = Array.from({ length: 100 }, (_, k) => k * 16.6667);
  const r = summarise(stamps);
  assert.equal(r.frames, 99, 'n stamps hold n-1 frames, as fpsStats has it');
  assert.ok(Math.abs(r.spanMs - 1650.0033) < 1e-9, `the span is 99 * 16.6667 (${r.spanMs})`);
  assert.equal(r.fps, 60, 'Math.round(99 * 1000 / span) - a 60 Hz leg reads 60, not 59');
  assert.ok(Math.abs(r.meanMs - 16.6667) < 1e-9, `the mean is the same 16.6667 (${r.meanMs})`);
  assert.ok(Math.abs(r.minMs - 16.6667) < 1e-9 && Math.abs(r.worstMs - 16.6667) < 1e-9, 'a flat leg has one frame time');
  assert.ok(Math.abs(r.p50Ms - 16.6667) < 1e-9 && Math.abs(r.p95Ms - 16.6667) < 1e-9, 'and one percentile');
  assert.ok(Math.abs(r.p99Ms - 16.6667) < 1e-9, `p99 is the same 16.6667 (${r.p99Ms})`);
  assert.ok(Math.abs(r.lowFps - 60) < 1e-3, `1000 / 16.6667, the 1% low, is a 60 Hz leg - a hair under, as 16.6667 is (${r.lowFps})`);
  assert.ok(Math.abs(r.lowFps * r.p99Ms - 1000) < 1e-9, 'and the 1% low is exactly 1000 / p99');
  assert.ok(Math.abs(r.seconds - 1.6500033) < 1e-9);
});

test('BENCH1: a 10 ms cadence with one 100 ms hitch is p99 100 ms and the 1% low 10 fps - the number a mean hides', () => {
  // 61 stamps, 60 gaps: 59 of 10 ms and the last one a 100 ms hitch. 60 gaps
  // put the hitch at rank ceil(0.99 * 60) - 1 = 59, so p99 IS the hitch.
  const stamps = [0];
  for (let k = 1; k <= 60; k++) stamps.push(stamps[k - 1] + (k === 60 ? 100 : 10));
  const r = summarise(stamps);
  assert.equal(r.frames, 60);
  assert.equal(r.spanMs, 690, '59 * 10 + 100');
  assert.equal(r.meanMs, 11.5, '690 / 60 - the mean that would have called this leg healthy');
  assert.equal(r.fps, 87, 'Math.round(60000 / 690)');
  assert.equal(r.minMs, 10, 'the fastest frame is still 10 ms');
  assert.equal(r.p50Ms, 10, 'half the frames were at the cadence');
  assert.equal(r.p95Ms, 10, 'rank ceil(0.95 * 60) - 1 = 56, still a 10');
  assert.equal(r.p99Ms, 100, 'the hitch, at rank 59');
  assert.equal(r.worstMs, 100, 'and the worst frame is the same one');
  assert.equal(r.lowFps, 10, '1000 / 100 - the 1% low is 10 fps on a leg that averaged 87');
});

test('BENCH1: seconds is the leg\'s own when it is finite, else the span\'s - and a NaN or Infinity is no duration at all', () => {
  assert.equal(summarise([0, 16], { seconds: 2 }).seconds, 2);
  assert.equal(summarise([0, 16], { seconds: 0 }).seconds, 0, 'a zero-length leg may say so itself');
  assert.equal(summarise([0, 2000], { seconds: NaN }).seconds, 2, 'a NaN duration falls back to the span');
  assert.equal(summarise([0, 2000], { seconds: Infinity }).seconds, 2);
  assert.equal(summarise([0, 2000], {}).seconds, 2, 'no argument, the span in seconds');
  assert.equal(summarise([0, 2000]).seconds, 2, 'and no options at all');
  assert.equal(summarise([0, 2000], { seconds: null }).seconds, 2);
});

test('BENCH1: a single stamp, an empty array, a non-array, a NaN stamp, a stopped clock - every derived number null, the counts honest zeroes', () => {
  assertNoMeasurement(summarise([5]), 'one stamp');
  assertNoMeasurement(summarise([]), 'an empty leg');
  assertNoMeasurement(summarise(null), 'a non-array');
  assertNoMeasurement(summarise(undefined), 'no argument');
  assertNoMeasurement(summarise('0,16,32'), 'a string of stamps');
  assertNoMeasurement(summarise([0, 16, NaN]), 'a NaN stamp');
  assertNoMeasurement(summarise([NaN, 0]), 'a NaN first stamp');
  assertNoMeasurement(summarise([0, 16, 8]), 'a stamp listed out of order');
  assertNoMeasurement(summarise([4, 4]), 'a clock that did not advance');
  assertNoMeasurement(summarise([4, 4], { seconds: 2 }), 'and even the leg\'s own seconds is null - nothing measured it');
  // no NaN and no stray 0 in a measured row either
  assert.ok(!Object.values(summarise([0, 16])).some((v) => Number.isNaN(v)));
});

test('BENCH1: the leg\'s stamps are read, never written - a summary leaves the input exactly as it came', () => {
  const stamps = [0, 16.7, 33.4, 50.1, 150.1, 166.8];
  const copy = stamps.slice();
  const before = stamps.length;
  summarise(stamps, { seconds: 1 });
  summarise(stamps);
  percentile(stamps, 99);
  assert.deepEqual(stamps, copy, 'the stamps are the caller\'s');
  assert.equal(stamps.length, before);
  assert.equal(stamps[0], 0, 'not sorted in place, not reversed, not truncated');
  const flat = [10, 10, 10];
  summarise(flat);
  assert.deepEqual(flat, [10, 10, 10]);
});
