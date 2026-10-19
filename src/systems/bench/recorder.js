// BENCH1 - THE TAIL OF THE FRAME DISTRIBUTION (2026-10-19). The game's own
// counter (ui/fpsCounter.js, `fpsStats`) reports a second's mean and worst,
// and a benchmark cannot be built on a mean: two legs both averaging 16.7 ms
// read the same, one of them perfectly flat and one of them stuttering - and
// the player of the second FEELS the hitch the mean hid. So this module
// reports the tail instead: p95, p99, and the "1% low" that names the pace a
// player's own eye calls a drop. That is the number a benchmark exists to
// move, and the number a patch that touched the culls has to be judged by.
//
// FRAMES ARE THE GAPS, exactly as fpsStats has it: n stamps hold n-1 frames
// ((n-1) * 1000 / span is the mean rate), and each gap is one frame's own
// duration - a 100 ms gap is the hitch, not a sample of the frames either
// side of it. A leg's stamps are the leg's own; nothing here is shared with
// the counter or with any host.
//
// AND A LEG WITH NOTHING TO MEASURE REPORTS null, NEVER 0. A `0 fps / 0 ms`
// row reads as "this leg was free", and a benchmark that lies is worse than
// none - so `frames` and `spanMs` stay honest zeroes (a count of nothing is
// zero) and every derived number is null until two stamps that advance say
// otherwise. This module imports NOTHING: it is arithmetic over numbers, so
// the test that pins it needs nothing but numbers.
//
// The pure half is executed by test/systems/bench/recorder.test.js.

/** The fields a leg either measures or does not - each null, never 0, with nothing to measure. */
const DERIVED = ['seconds', 'fps', 'meanMs', 'minMs', 'p50Ms', 'p95Ms', 'p99Ms', 'worstMs', 'lowFps'];

/**
 * A leg that measured nothing: the two counts it can honestly report, and a
 * null for every number a person would otherwise read as a measurement (a
 * 0 fps row would say the leg was free, which is the one thing it was not).
 * @returns {{frames:number, spanMs:number, seconds:null, fps:null, meanMs:null, minMs:null, p50Ms:null, p95Ms:null, p99Ms:null, worstMs:null, lowFps:null}}
 */
function noMeasurement() {
  const r = { frames: 0, spanMs: 0 };
  for (const k of DERIVED) r[k] = null;
  return r;
}

/**
 * The p-th percentile of a sorted, ascending list by NEAREST RANK: the value
 * at `clamp(ceil((p / 100) * n) - 1, 0, n - 1)`. A percentile is the frame
 * time that many per cent of the leg's frames were at or under - p95 is the
 * frame a stutter has to beat to be felt, p99 the one it has to beat to be
 * remembered. Null for a non-array, an empty list, a non-finite `p`, or an
 * entry that is not a finite number (a rank that holds no number answers
 * nothing, never NaN).
 * @param {number[]} sortedAsc the values, ascending
 * @param {number} p the percentile, 0..100
 * @returns {number|null} the value at that rank, or null with no rank to give
 */
export function percentile(sortedAsc, p) {
  if (!Array.isArray(sortedAsc) || sortedAsc.length === 0 || !Number.isFinite(p)) return null;
  const n = sortedAsc.length;
  const index = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
  const value = sortedAsc[index];
  return Number.isFinite(value) ? value : null;
}

/**
 * One leg's frame summary from its ascending timestamps in ms. The gaps are
 * the frames: `frames` is n-1, `spanMs` runs from the first stamp to the
 * last, `meanMs` is the span over the frames, `minMs` the fastest frame,
 * `p50Ms` / `p95Ms` / `p99Ms` the percentiles of the gaps, `worstMs` the
 * slowest frame, and `lowFps` = 1000 / p99Ms - the "1% low", the rate a
 * player would call the leg's bad moments. `seconds` is the leg's own
 * duration when given finite, else the span's. With nothing to measure
 * (fewer than 2 stamps, a non-array, a non-finite or out-of-order stamp, a
 * clock that did not advance) every derived number is null while `frames`
 * and `spanMs` stay 0. Reads the stamps, never writes them.
 * @param {number[]} stamps frame times in ms, ascending, the leg's own
 * @param {{seconds?: number|null}} [opts] the leg's duration in seconds, when it has one
 * @returns {{frames:number, spanMs:number, seconds:number|null, fps:number|null, meanMs:number|null, minMs:number|null, p50Ms:number|null, p95Ms:number|null, p99Ms:number|null, worstMs:number|null, lowFps:number|null}}
 */
export function summarise(stamps, { seconds = null } = {}) {
  if (!Array.isArray(stamps) || stamps.length < 2) return noMeasurement();
  const n = stamps.length;
  const frames = n - 1;
  const spanMs = stamps[n - 1] - stamps[0];
  const gaps = [];
  for (let i = 1; i < n; i++) {
    const gap = stamps[i] - stamps[i - 1];
    // a NaN stamp, or one listed before its predecessor, is a stamp order no
    // frame was measured in - the arithmetic below would mean nothing
    if (!Number.isFinite(gap) || gap < 0) return noMeasurement();
    gaps.push(gap);
  }
  // a clock that did not advance holds no frames: (n-1) * 1000 / 0 would read
  // as an infinite rate and every percentile as a 0 ms frame
  if (!(spanMs > 0)) return noMeasurement();
  let minMs = gaps[0];
  let worstMs = gaps[0];
  for (let i = 1; i < gaps.length; i++) {
    if (gaps[i] < minMs) minMs = gaps[i];
    if (gaps[i] > worstMs) worstMs = gaps[i];
  }
  const p50Ms = percentile(gaps, 50);
  const p95Ms = percentile(gaps, 95);
  const p99Ms = percentile(gaps, 99);
  return {
    frames,
    spanMs,
    seconds: Number.isFinite(seconds) ? seconds : spanMs / 1000,
    fps: Math.round((frames * 1000) / spanMs),   // fpsStats' own rounding, so a leg and the counter agree
    meanMs: spanMs / frames,
    minMs,
    p50Ms,
    p95Ms,
    p99Ms,
    worstMs,
    lowFps: p99Ms > 0 ? 1000 / p99Ms : null,   // the 1% low; a 0 ms p99 has no rate to give
  };
}
