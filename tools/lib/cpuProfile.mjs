// THE CPU PROFILER'S PURE HALF, AS A MODULE (BENCH1, docs/Benchmark-Tool-Plan.md).
//
// tools/cpuReport.mjs reads a V8 sampling profile and writes the report; BENCH1
// wants the same reading of the same payload - the frame vocabulary, the self-time
// table, the `[perf]` line and the allocation sampler's tree - so those four live
// here and the script imports them, rather than the benchmark growing a second
// copy of the arithmetic and the two drifting apart. That is a move, not a
// rewrite: every function and every comment above it came out of cpuReport.mjs
// whole, so `npm run cpu` behaves identically, byte for byte, on the same page.
//
// NOTHING HERE LAUNCHES A BROWSER, reads a file or touches the process. Importing
// this module is free; importing cpuReport.mjs is not - it boots a page and
// profiles it - which is why the benchmark (and a test) import this one.

/**
 * Where a sampled frame lives, in the report's own vocabulary. V8's own buckets
 * carry no url and are NOT GL - `(program)` is time outside any JS function and
 * `(garbage collector)` is the collector - so each is named for what it is: the
 * "a big (native) entry means a GPU-bound frame" reading must not be applied to
 * them by accident.
 */
export function framePlace(cf) {
  const url = (cf.url || '').replace(/[?#].*$/, '');
  const line = (cf.lineNumber ?? 0) + 1;
  if (!url) {
    const fn = cf.functionName || '';
    if (fn === '(idle)') return { file: '(idle)', line: 0, game: false };
    if (fn === '(program)') return { file: '(v8: program)', line: 0, game: false };
    if (fn === '(garbage collector)') return { file: '(v8: gc)', line: 0, game: false };
    // The allocation sampler's own pseudo-frames, which carry no url either: naming
    // them keeps them out of a `(native)` row a reader would take for a GL call.
    if (fn === '(IDLE_EXTERNAL)') return { file: '(v8: idle external)', line: 0, game: false };
    if (fn === '(BYTECODE_COMPILER)') return { file: '(v8: bytecode compiler)', line: 0, game: false };
    if (fn === '(GC)') return { file: '(v8: gc)', line: 0, game: false };
    if (fn === '(ROOT_OVERFLOW)') return { file: '(v8: root overflow)', line: 0, game: false };
    if (fn === '(UNKNOWN)') return { file: '(v8: unknown)', line: 0, game: false };
    return { file: '(native)', line: 0, game: false };
  }
  const src = url.match(/\/src\/(.*)$/);
  if (src) return { file: `src/${src[1]}`, line, game: true };
  // THE BUILT SITE IS THE GAME TOO. On the deployed pages vite bundles the whole
  // source into /assets/<name>-<hash>.js; there is no /src/ path to match, so the first
  // cut of this classified every game function as "everything else" and then refused
  // its own report over a world that was running perfectly ("game code 0.0%").
  const built = url.match(/\/(assets)\/(.*\.m?js)$/);
  if (built) return { file: `assets/${built[2]}`, line, col: (cf.columnNumber ?? 0) + 1, game: true };
  const dep = url.match(/\/node_modules\/(?:\.vite\/deps\/)?(.*)$/);
  if (dep) return { file: `node_modules/${dep[1]}`, line, game: false };
  return { file: url.replace(/^https?:\/\/[^/]+/, ''), line, game: false };
}

/**
 * The profile's samples, summed per (function, file, line) as SELF time: the
 * milliseconds each function spent in its own body, which is the number to
 * optimise. A caller's total (self plus callees) answers a different question -
 * "what is expensive because of this entry point" - and DevTools' flame chart is
 * the better place to ask it. `timeDeltas[i]` is the gap before `samples[i]`, so
 * it is attributed to that sample rather than assuming the nominal interval: the
 * delta sum is the wall time actually sampled. `interval` is charged to a sample
 * that carries no delta of its own, and defaults to 250 - the profiler script's
 * own default sampling interval in microseconds (`SAMPLING`); the fallback is used
 * only when `timeDeltas[i]` is missing, never in place of a delta that is there.
 * @param {any} profile the Profiler.stop payload
 * @param {number} [interval=250] microseconds charged to a sample without a `timeDeltas[i]`
 */
export function aggregate(profile, interval = 250) {
  const byId = new Map((profile.nodes ?? []).map((n) => [n.id, n]));
  const selfUs = new Map();
  const deltas = profile.timeDeltas ?? [];
  (profile.samples ?? []).forEach((id, i) => {
    const d = deltas[i] ?? interval;
    selfUs.set(id, (selfUs.get(id) ?? 0) + d);
  });
  const rows = new Map();
  for (const [id, us] of selfUs) {
    const cf = byId.get(id)?.callFrame ?? {};
    const where = framePlace(cf);
    const fn = cf.functionName || '(anonymous)';
    const key = `${where.file}\u0000${fn}\u0000${where.line}`;
    const row = rows.get(key) ?? { fn, ...where, us: 0 };
    row.us += us;
    rows.set(key, row);
  }
  const list = [...rows.values()].sort((a, b) => b.us - a.us);
  const totalUs = list.reduce((a, r) => a + r.us, 0);
  const wallSeconds = Math.max(0, ((profile.endTime ?? 0) - (profile.startTime ?? 0)) / 1e6);
  return { list, totalUs, wallSeconds, samples: (profile.samples ?? []).length };
}

/**
 * THE `[perf]` LINE, READ (src/render/perfMeter.js). Two shapes, and the units tell them
 * apart - a count has no decimal point, a zone is always `toFixed(2)`:
 *   `[perf] gpu 21.40ms | draws 1210 | sun 3c/12d | lanterns 4k/12f/9d | ...`
 *   `[perf] gpu 21.40ms | shadow 9.10 | grass 3.20 | air 1.80 | draws 1210`
 * `gpu n/a` is the browser refusing EXT_disjoint_timer_query_webgl2 - the line is still
 * worth reading for its counts, and the timer being absent is not a zero. The LAST line
 * is the one returned: it is the mean of the frames the recording ended on.
 * @param {string[]} lines every `[perf]` console line seen, oldest first
 */
export function parsePerf(lines) {
  const last = Array.isArray(lines) ? lines[lines.length - 1] : null;
  if (!last) return null;
  const body = last.replace(/^.*?\[perf\]/, '').trim();
  const parts = body.split('|').map((s) => s.trim()).filter(Boolean);
  let gpuMs = null;
  let cpuMs = null;
  const zones = [];
  const counts = [];
  for (const p of parts) {
    const total = p.match(/^(gpu|cpu) ([\d.]+)ms$/i);
    // WHICH CLOCK, KEPT. `?perf=cpu` (perfMeter.js's PERF-CPU arm) tiles the frame on the MAIN THREAD's
    // clock, so its total is not the GPU's and must never be printed as one - a report comparing a CPU
    // total against the JavaScript would invent a split out of the same milliseconds counted twice.
    if (total) { if (total[1].toLowerCase() === 'gpu') gpuMs = Number(total[2]); else cpuMs = Number(total[2]); continue; }
    if (/^(gpu|cpu) n\/a$/i.test(p)) continue;
    const zone = p.match(/^(.*?) (\d+\.\d+)$/);
    if (zone) { zones.push([zone[1], Number(zone[2])]); continue; }
    counts.push(p);
  }
  return { gpuMs, cpuMs, zones, counts, body, seen: lines.length };
}

/**
 * The allocation sampler's tree, summed per (function, file, line) as SELF bytes:
 * what that function's own frame allocated while it ran. `HeapProfiler.startSampling`
 * samples the heap every `samplingInterval` bytes and attributes each sample to the
 * JS stack that made it, so this is the same shape as the CPU table - the functions
 * that allocate, not the constructors the heap holds. For what the heap CONTAINS
 * (counts by constructor, retained sizes) take a snapshot: SNAPSHOT=1.
 * @param {any} profile HeapProfiler.stopSampling's profile
 */
export function aggregateAlloc(profile) {
  if (!profile?.head) return null;
  const rows = new Map();
  let total = 0;
  const stack = [profile.head];
  while (stack.length) {
    const node = stack.pop();
    const bytes = node.selfSize || 0;
    if (bytes > 0) {
      const cf = node.callFrame || {};
      const where = framePlace(cf);
      const fn = cf.functionName || '(anonymous)';
      const key = `${where.file}\u0000${fn}\u0000${where.line}`;
      const row = rows.get(key) ?? { fn, ...where, bytes: 0 };
      row.bytes += bytes;
      total += bytes;
      rows.set(key, row);
    }
    for (const c of node.children || []) stack.push(c);
  }
  return { list: [...rows.values()].sort((a, b) => b.bytes - a.bytes), total };
}
