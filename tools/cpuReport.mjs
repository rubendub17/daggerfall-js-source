// CPU REPORT - a sampling CPU profile of the running game, ranked per function.
//
// Mac's ask (2026-10-18): "i just want to see code wise, like in each function
// etc where it spends more time computing in the gameplay not loading screens
// ... is there a way to do that? like something i can toggle to record and then
// will generate a report". DevTools answers the same question in its
// Performance panel's Bottom-Up table, which sorts by self time; this exists
// because a flame chart has to be READ and a table can be DIFFED. The numbers
// land in cpu-report.md, and the raw profile beside it (cpu-report.cpuprofile)
// opens in DevTools for the caller tree - so the report is the index and the
// flame chart is the detail.
//
// THE LOADING SCREEN IS EXCLUDED WHERE THE GAME CAN SAY SO. A `?shot` world
// raises `window.__shotReady` when its stream queue is empty and nothing is
// building (src/scenes/world.js), and installs `window.__streamIdle()`, the same
// test callable; every SCENE below carries `?shot`, so the precise answer is
// available by default. A page without it - a player's own tab - falls back to
// "a host is stamping frames and the renderer has been drawing steadily for two
// seconds", which is an approximation and is documented as one.
//
// TWO WAYS TO RECORD, because there are two ways to be playing.
//
// (1) PLAY IN THE WINDOW THIS OPENS. It needs the dev server up (`npm run dev`,
// port 5173 - PORT= says otherwise); it boots the world, waits for it, then
// records for SECONDS while you play in the window it opened:
//   $env:SECONDS='300'; npm run cpu            # five minutes of your own play
//   $env:URL='http://localhost:5173/play/?fps'; $env:SECONDS='60'; npm run cpu
//
// (2) ATTACH TO THE BROWSER YOU ARE ALREADY IN, on your own GPU, mid-session, so
// the profile is of the stutter you feel. Chrome 136 and later refuse the debug
// port on the default profile, so this needs its own profile directory once:
//   chrome.exe --remote-debugging-port=9222 --user-data-dir=C:\tmp\cpu-profile
//   ...play there, get to the place that stutters, then in another terminal:
//   $env:ATTACH='http://127.0.0.1:9222'; $env:SECONDS='20'; npm run cpu
//   The profile starts immediately and runs for SECONDS while you play. In dev
//   the game's data comes from the server, so a fresh profile needs no ARENA2;
//   online, sign in again in the new window.
//
// EVERY SETTING BELOW HAS A FLAG TOO, and the flag is the safe spelling because it
// reads the same in cmd and in PowerShell: `npm run cpu -- --attach <url> --snapshot`.
//   --attach --url --scene --seconds --warmup --out --region --loc --port --target
//   --chrome --sampling --ready --heapsampling --snapshot --online --headless --all
//   --no-memory --perf --zones --no-perf
//
// THE GPU NUMBER RIDES THE SAME RUN (2026-10-18). A CPU profile can only say what the
// MAIN THREAD did. On a frame that costs 56 ms and runs 12 ms of JavaScript, the other
// 44 ms is either the GPU or the present, and nothing in a JS profile can tell them
// apart - which is exactly the question a report has to answer before it names a thing
// to optimise. So every URL this file builds carries `&perf`, the port's own GPU clock
// (src/render/perfMeter.js: EXT_disjoint_timer_query_webgl2, one console line every
// PERF_EVERY world frames with the frame's mean GPU time and the lane's counts), and the
// report prints it beside the JS it measured: GPU-bound or CPU-bound, with the number.
// `--zones` asks for `?perf=zones` instead - the same total tiled into the passes that
// made it - and `--no-perf` leaves the URL alone.
//
// Env:
//   SCENE      city (default) | road | dungeon - what to boot and play in
//   URL        the page, overriding SCENE entirely
//   REGION     with SCENE=city, the region   (Daggerfall)
//   LOC        with SCENE=city, the town     (Daggerfall - the capital, the
//              densest place offline; `LOC=Wayrest` or `LOC=Sentinel` for others)
//   PORT       the dev server's port         (5173)
//   BASE       where the game is served - `http://localhost:<PORT>` by default, or the
//              DEPLOYED site for a run against the real relay:
//              `--base https://daggerfalljs.dev --online`. On a deployed page the
//              front door is a menu, so the world cannot be detected: sign in and start
//              playing inside the window, and let the recorder start on a timer -
//              `--base https://daggerfalljs.dev --online --ready true --warmup 90`
//   ONLINE=1   boot on the relay's lane (`?online`) - takes a signed-in browser, so
//              normally paired with ATTACH; without one the game stays at its door
//   SECONDS    how long to sample              (60)
//   WARMUP     seconds discarded after the world settles - a LAUNCHED window
//              only; an attached tab is already playing and starts at once. (8)
//   SAMPLING   microseconds between samples    (250)
//   READY      a JS expression true when the scene is settled. The default asks,
//              in order: the world's live `__streamIdle()` (the stream queue empty,
//              nothing building, nothing in flight - precise, and what every SCENE
//              carries), then "a host is stamping frames and drawing, steadily, for
//              two seconds". That second one is an APPROXIMATION: it cannot see the
//              stream queue, so a very long stream can still be running under it -
//              WARMUP is the knob there. IF THE GAME IS RUNNING AND THE TOOL STILL
//              WILL NOT SETTLE, `READY=true` records anyway - with `WARMUP=30` it
//              starts half a minute after the page opens.
//   READY_TIMEOUT  how long to wait for it     (90000 ms)
//   ATTACH     a CDP endpoint - profile that browser instead of launching one
//   BROWSER    --browser <path to opera.exe|chrome.exe>: start THAT browser on the
//              CDP port with its own profile dir, then profile it. Use this when
//              --attach keeps answering ECONNREFUSED: on Windows a browser that is
//              already running will not take --remote-debugging-port at all, and its
//              own profile dir is what makes a new process start
//   CDP_PORT   the port --browser launches on   (9222)
//   ATTACH_WAIT  seconds to keep trying a dead endpoint before giving up (45)
//   TARGET     with ATTACH, a URL substring choosing the tab
//   HEADLESS=1 run headless. SwiftShader rasterises on the CPU, so its GL work
//              lands in the profile as GL self time - a smoke test, not a number.
//              (`HEADED=0`, tools/perfProbe.mjs's spelling, means the same here.)
//   CHROME     a chrome.exe to drive, when playwright's own browser is missing
//   ALL=1      report every frame, not just the game's own src/
//   MEMORY=0   turn the allocation sampler off (it is ON: a sampling heap profile
//              over the same window, in bytes, by the JS stack that allocated - the
//              same shape as the time table - plus the heap's used/total either side,
//              so the GROWTH over the recording is a number, not a feeling)
//   SNAPSHOT=1 also write the whole live heap as <OUT>.heapsnapshot for DevTools >
//              Memory > Load: that is what the heap HOLDS - object counts and
//              shallow sizes by constructor - which the sampler cannot say
//   HEAP_SAMPLING  bytes between allocation samples (32768)
//   OUT        basename of the report and the profile (cpu-report)
//
// Perf-CPU's zones (`?perf=cpu`, render/perfMeter.js) answer "which PHASE"; this
// answers "which FUNCTION". They are meant to be read together: a phase that is
// hot here, then the functions inside it that own its milliseconds.
import { chromium } from 'playwright';
import { writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

// FLAGS FIRST, SO NOBODY HAS TO KNOW THEIR SHELL. `$env:X='y'` is PowerShell and
// `set X=y` is cmd; pasting one into the other fails before Node ever runs (cmd
// answers "the syntax of the file name, directory name or volume label is
// incorrect" for `$env:ATTACH='http://...'`). A flag reads the same in both:
//   npm run cpu -- --attach http://127.0.0.1:9222 --snapshot
const FLAGS = {
  '--attach': 'ATTACH', '--browser': 'BROWSER', '--cdp-port': 'CDP_PORT', '--attach-wait': 'ATTACH_WAIT',
  '--url': 'URL', '--base': 'BASE', '--scene': 'SCENE', '--seconds': 'SECONDS',
  '--warmup': 'WARMUP', '--out': 'OUT', '--region': 'REGION', '--loc': 'LOC',
  '--port': 'PORT', '--target': 'TARGET', '--chrome': 'CHROME', '--sampling': 'SAMPLING',
  '--ready': 'READY', '--heapsampling': 'HEAP_SAMPLING',
};
const SWITCHES = { '--snapshot': ['SNAPSHOT', '1'], '--online': ['ONLINE', '1'], '--headless': ['HEADLESS', '1'], '--all': ['ALL', '1'], '--no-memory': ['MEMORY', '0'], '--frontdoor': ['FRONTDOOR', '1'], '--persist': ['PERSIST', '1'], '--perf': ['PERF', '1'], '--no-perf': ['PERF', '0'], '--zones': ['ZONES', '1'] };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (FLAGS[a]) { process.env[FLAGS[a]] = process.argv[++i] ?? ''; continue; }
  if (SWITCHES[a]) { process.env[SWITCHES[a][0]] = SWITCHES[a][1]; continue; }
  if (a.startsWith('--')) throw new Error(`cpu: unknown flag ${a} - one of ${[...Object.keys(FLAGS), ...Object.keys(SWITCHES)].join(' ')}`);
}

// THE SCENE. Three presets, and the city is the default because the question is
// "why does it lag when I play": the capital has the most models, flats and
// lights a frame can carry offline.
//
// TWO DOORS, EACH DOING ONE JOB:
//   `?shot` installs the settle surface - `window.__shotReady` and
//     `window.__streamIdle` are both assigned inside the world's `if (shotMode)`
//     blocks (src/scenes/world.js:"if (queue.length === 0 && !building && !window.__shotReady)"). That is how
//     this file's first run failed: no shot door, so nothing ever settled, and
//     the recorder waited out its timeout over a game that was running fine.
//   `?play` keeps `walkMode` on: a shot boot's camera flies and no player is
//     spawned (world.js:"const walkMode = params.has('play') || (!params.has('fly') && !shotMode)"), so
//     `shot` alone is a camera, not the game being played.
const PORT = Number(process.env.PORT || 5173);
// BASE is what the SCENEs hang off: the dev server by default, and the deployed site
// for a run against the REAL relay (`--base https://daggerfalljs.dev`).
const BASE = (process.env.BASE || `http://localhost:${PORT}`).replace(/\/+$/, '');
const REGION = process.env.REGION || 'Daggerfall';
const LOC = process.env.LOC || 'Daggerfall';   // the capital: DFU's densest town, the "a lot of things" spawn
// ONLINE=1 boots the page on the relay's lane (`?online`, main.js's own flag for the
// world host's join). It needs a SIGNED-IN session in the browser being profiled: a
// launched window starts with an empty profile, so online numbers are normally taken
// by ATTACHing to the player's own browser. Kept here because the online clock runs
// at the sky's rate and that changes what the living world is asked for.
const ONLINE = process.env.ONLINE === '1';
const ONLINE_DOOR = ONLINE ? '&online' : '';
// THE GPU DOOR (`?perf`, see the header). On by default because a report without it
// cannot answer "is this frame the JS or the GPU", and that is the first question a
// reader of a 56 ms frame asks. ZONES=1 asks for the passes (`?perf=zones`), which is
// the finer answer and the one worth the second run.
const PERF = process.env.PERF !== '0';
const PERF_DOOR = PERF ? (process.env.ZONES === '1' ? '&perf=zones' : '&perf') : '';
const SCENES = {
  city: `${BASE}/play/?world&region=${encodeURIComponent(REGION)}&loc=${encodeURIComponent(LOC)}&class=1&novideo&shot&play&fps${ONLINE_DOOR}${PERF_DOOR}`,
  road: `${BASE}/play/?world&spawn=random&class=1&novideo&shot&play&fps${ONLINE_DOOR}${PERF_DOOR}`,
  dungeon: `${BASE}/play/?shot&play&class=0&fps${ONLINE_DOOR}${PERF_DOOR}`,
};
const SCENE = process.env.SCENE || 'city';
// READINESS, IN ORDER OF HOW MUCH IT CAN SEE.
//   `__streamIdle()`   the LIVE test - the stream queue empty, nothing building,
//                      nothing in flight (src/scenes/world.js). Shot-only, hence
//                      the `typeof` guard. This is the precise answer.
//   the FPS counter    the fallback, and the only one a player's own tab has:
//                      `scriptMs` is null until a HOST stamps a frame
//                      (systems/frameClock.js) and `draws` is the renderer's own
//                      count - but a world DRAWS BEHIND a DOM loading overlay, so
//                      this half cannot see a stream and only asks for two
//                      seconds of steady drawing. It is honest about that, and
//                      WARMUP is the knob if the city is still streaming.
// `__shotReady` is deliberately NOT a condition of its own: the world sets it ONCE
// and never clears it (world.js:"if (queue.length === 0 && !building && !window.__shotReady)"),
// so it is a latch from whatever frame happened to be quiet - often the first -
// and settling on it would start the recorder mid-stream, which is the whole
// thing this wait exists to prevent.
const DEFAULT_READY = `(() => {
  if (typeof globalThis.__streamIdle === 'function' && globalThis.__streamIdle()) return true;
  const s = globalThis.__fpsStats?.();
  if (!s || s.scriptMs == null || (s.draws ?? 0) < 200) { globalThis.__cpuSteadySince = 0; return false; }
  globalThis.__cpuSteadySince ||= Date.now();
  return Date.now() - globalThis.__cpuSteadySince >= 2000;
})()`;
// FRONTDOOR: the real menu - login, character pick, the world - instead of the probe's
// world doors, so the player plays exactly as in their own browser. Set by --frontdoor.
const FRONTDOOR = process.env.FRONTDOOR === '1';
const PERSIST = process.env.PERSIST === '1';
const URL_ = process.env.URL || (FRONTDOOR ? `${BASE}/play/?fps${ONLINE_DOOR}${PERF_DOOR}` : SCENES[SCENE]);
const SECONDS = Math.max(1, Number(process.env.SECONDS || 60));
const WARMUP = Math.max(0, Number(process.env.WARMUP || 8));
const SAMPLING = Math.max(20, Number(process.env.SAMPLING || 250));
const READY = process.env.READY || DEFAULT_READY;
const READY_TIMEOUT = Math.max(1000, Number(process.env.READY_TIMEOUT || 90000));
const ATTACH = process.env.ATTACH || '';
// --browser <exe>: start THAT browser (Opera GX, Chrome) with the debug port and its
// own profile dir, then attach to it - so nothing depends on the user having quit the
// browser, known the flag, or opened the right tab.
const BROWSER = process.env.BROWSER || '';
const CDP_PORT = Number(process.env.CDP_PORT || 9222);
const ATTACH_WAIT = Math.max(1, Number(process.env.ATTACH_WAIT || 45));
const TARGET = process.env.TARGET || '';
// Headed by default, and named for the opt-OUT: a CPU profile of a software
// rasteriser is a profile of SwiftShader. `HEADED=0` is accepted because that is
// the spelling tools/perfProbe.mjs uses for the same choice.
const HEADLESS = process.env.HEADLESS === '1' || process.env.HEADED === '0';
// A mistyped SCENE would otherwise reach page.goto as undefined and fail there,
// which reads like a broken tool rather than a wrong word.
if (!URL_ && !ATTACH) throw new Error(`cpu: no scene "${SCENE}" - one of ${Object.keys(SCENES).join(', ')}, or URL= with a page of your own`);
const ALL = process.env.ALL === '1';
const OUT = process.env.OUT || 'cpu-report';
// MEMORY rides the same recording: the allocation sampler (bytes, by the JS stack
// that made them) and the heap's used/total either side of the window. MEMORY=0
// turns it off. SNAPSHOT=1 writes the whole live heap as DevTools' own file.
const MEMORY = process.env.MEMORY !== '0';
const SNAPSHOT = process.env.SNAPSHOT === '1';
const HEAP_SAMPLING = Math.max(1024, Number(process.env.HEAP_SAMPLING || 32768));

/**
 * Where a sampled frame lives, in the report's own vocabulary. V8's own buckets
 * carry no url and are NOT GL - `(program)` is time outside any JS function and
 * `(garbage collector)` is the collector - so each is named for what it is: the
 * "a big (native) entry means a GPU-bound frame" reading must not be applied to
 * them by accident.
 */
function framePlace(cf) {
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
 * delta sum is the wall time actually sampled.
 * @param {any} profile the Profiler.stop payload
 */
export function aggregate(profile, interval = SAMPLING) {
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

const pct = (us, total) => (total ? (us / total) * 100 : 0);
const ms = (us) => us / 1000;
const f = (n, d = 1) => Number(n).toFixed(d);
/** Bytes as a reader thinks of them: KB under a megabyte, MB above it. */
const fbytes = (b) => (b >= 1048576 ? `${f(b / 1048576)} MB` : `${f(b / 1024)} KB`);
/** Where a row lives. A built bundle keeps every function on line 1, so its column is
 *  the part that identifies it - `assets/main-ab12.js:1:20481` is a place you can find. */
const at = (r) => `${r.file}${r.line ? `:${r.line}` : ''}${r.col ? `:${r.col}` : ''}`;

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
 * WHICH HALF OF THE FRAME THIS IS, said in one line. The GPU number is the page's own
 * clock and the JS number is this profile's share of the game's own code per frame;
 * a frame that is mostly GPU will not speed up from work in `src/`, and one that is
 * mostly JS will. Both are means over slightly different windows, so the margin that
 * counts as "one side owns it" is 1.5x rather than 51/49.
 */
function bottleneckOf(gpuMs, jsPerFrame) {
  if (gpuMs == null || jsPerFrame == null) return null;
  if (gpuMs >= jsPerFrame * 1.5) {
    return {
      side: 'GPU',
      text: `**GPU-bound**: the GPU takes ${f(gpuMs, 2)} ms a frame against ${f(jsPerFrame, 2)} ms of the game's JS. `
        + 'Cutting `src/` cannot win back much of this one - take `--zones` and read the passes.',
    };
  }
  if (jsPerFrame >= gpuMs * 1.5) {
    return {
      side: 'JS',
      text: `**CPU-bound in the game's own JS**: ${f(jsPerFrame, 2)} ms a frame against ${f(gpuMs, 2)} ms of GPU. `
        + 'The hot table below is the list of what to cut.',
    };
  }
  return {
    side: 'split',
    text: `**split**: ${f(jsPerFrame, 2)} ms of game JS and ${f(gpuMs, 2)} ms of GPU - neither side owns the frame, `
      + 'so the frame is lost between them (the present, or the driver waiting on both).',
  };
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

/** One markdown table of rows. `perFrame` is the ms of a frame this function
 *  owns, which is the number that says whether it matters at 60 fps. */
function table(rows, totalUs, frames) {
  const head = '| self ms | % | ms/frame | function | where |\n|---:|---:|---:|---|---|';
  const body = rows.map((r) => `| ${f(ms(r.us))} | ${f(pct(r.us, totalUs))} | ${frames ? f(ms(r.us) / frames, 2) : '-'} | \`${r.fn}\` | ${at(r)} |`);
  return [head, ...body].join('\n');
}

// the browser ---------------------------------------------------------------------------------
// A Chrome is a Chrome, but THIS checkout's playwright (1.56) asks for one build
// number and a machine often holds another - `npm run perf` fails the same way.
// So the bundled browser is tried first, then the cache's newest chromium, then
// CHROME= says which to use. Attaching (`ATTACH=`) needs no browser at all.
function cachedChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH
    || (process.platform === 'win32' ? join(homedir(), 'AppData', 'Local', 'ms-playwright')
      : process.platform === 'darwin' ? join(homedir(), 'Library', 'Caches', 'ms-playwright')
        : join(homedir(), '.cache', 'ms-playwright'));
  const bins = [
    'chrome-win64/chrome.exe', 'chrome-win/chrome.exe',
    'chrome-linux64/chrome', 'chrome-linux/chrome',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
  ];
  const dirs = (() => { try { return readdirSync(base).filter((n) => /^chromium-\d+$/.test(n)).sort((a, b) => parseInt(b.slice(9)) - parseInt(a.slice(9))); } catch { return []; } })();
  for (const d of dirs) for (const b of bins) {
    const p = join(base, d, b);
    if (existsSync(p)) return { path: p, found: d };
  }
  return null;
}

async function launchBrowser(opts) {
  if (process.env.CHROME) return chromium.launch({ ...opts, executablePath: process.env.CHROME });
  try {
    return await chromium.launch(opts);
  } catch (err) {
    if (!/Executable doesn't exist/.test(err?.message ?? '')) throw err;
    const cached = cachedChromium();
    if (cached) {
      console.log(`cpu: playwright's own browser is missing; using ${cached.found}`);
      return chromium.launch({ ...opts, executablePath: cached.path });
    }
    throw new Error('cpu: no browser to launch - run `npx playwright install chromium`, or set CHROME=<path to chrome.exe>, or use ATTACH=<cdp url>');
  }
}

// THE TAB TO PROFILE, ASKED OF THE PAGE. A browser connected over CDP exposes
// every tab it has, and the URL Playwright reports for one that existed before
// the connection can be EMPTY even though the tab is on a real page (Chrome 151
// over playwright 1.56 did exactly that here) - so picking on `page.url()` alone
// attached to a blank target and profiled 100% idle. The tab's own
// `location.href` is the only answer that cannot be wrong, and a blank one is
// refused rather than profiled.
async function pickTab(browser) {
  const seen = [];
  for (const p of browser.contexts().flatMap((c) => c.pages())) {
    // A tab whose evaluate THREW has not proved it can answer at all, so it is
    // kept out of the real pool rather than admitted on its cached URL - a dead
    // tab on the game's own URL is the worst thing to pick.
    const url = await p.evaluate(() => location.href).catch(() => null);
    seen.push({ page: p, url: url ?? '', dead: url == null });
  }
  const real = seen.filter((t) => !t.dead && /^https?:\/\//.test(t.url));
  const pool = real.length ? real : seen;
  if (TARGET) {
    // A TARGET that matches nothing must NOT quietly profile some other tab: with
    // two game tabs open that is a report of the tab the player did not ask for.
    const byName = real.find((t) => t.url.includes(TARGET));
    if (!byName) {
      throw new Error(`cpu: no tab whose URL contains "${TARGET}" - the tabs it has are: ${seen.map((t) => t.url || '(blank)').join(', ') || '(none)'}`);
    }
    return byName;
  }
  let pick;
  try {
    const { host } = new URL(URL_);
    pick = pool.filter((t) => t.url.includes(host)).pop();
  } catch { /* URL= that is not a URL simply does not narrow anything */ }
  pick ??= pool[pool.length - 1];
  if (!pick) return null;
  if (!/^https?:\/\//.test(pick.url)) {
    throw new Error(`cpu: ${ATTACH} has no game tab to profile - the tabs it has are: ${seen.map((t) => t.url || '(blank)').join(', ') || '(none)'}. Open the game, or set TARGET= to a substring of its URL.`);
  }
  return pick;
}

/**
 * Wait for a browser to answer on the CDP endpoint, then connect. A user starts the
 * browser by hand and the port takes a second to open; and on Windows a second launch
 * of an ALREADY RUNNING browser only hands the URL to the first process, so the flag
 * silently does nothing and the port never appears - which is the failure this loop
 * turns into a wait instead of an ECONNREFUSED stack.
 */
async function connectAttach(url, seconds) {
  const until = Date.now() + seconds * 1000;
  let lastErr = null;
  let said = false;
  do {
    try {
      return await chromium.connectOverCDP(url);
    } catch (err) {
      lastErr = err;
      if (!/ECONNREFUSED|Timeout|connect|EPIPE/i.test(String(err?.message ?? err))) throw err;
      if (!said) {
        console.log(`cpu: nothing answers on ${url} yet - waiting up to ${seconds} s. Launch the browser with --remote-debugging-port and its own --user-data-dir now (or pass --browser <exe> and I launch it).`);
        said = true;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  } while (Date.now() < until);
  throw new Error(`cpu: nothing answered on ${url} in ${seconds} s (${String(lastErr?.message ?? lastErr).trim().split('\n')[0]}). `
    + 'A browser on Windows must be FULLY QUIT before it will take --remote-debugging-port: launch it with its own --user-data-dir, '
    + 'or pass --browser <path to opera.exe|chrome.exe> and the recorder starts one for you.');
}

/**
 * Start the browser the user named (`--browser`) with the CDP port and its own profile
 * dir, and answer the endpoint. Its own dir is what makes a NEW process start rather
 * than the URL being handed to one already running.
 */
async function launchForAttach(exe, port, seconds) {
  const { spawn } = await import('node:child_process');
  const dir = join(tmpdir(), 'cpu-report-profile');
  console.log(`cpu: launching ${exe} on port ${port} (profile ${dir})`);
  const child = spawn(exe, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { detached: true, stdio: 'ignore' });
  child.unref();
  return connectAttach(`http://127.0.0.1:${port}`, seconds);
}

let browser = null;
let page = null;
let tabUrl = '';   // the URL the PAGE ITSELF reported - the one to trust in the report
const errors = [];
const logged = [];
// THE `[perf]` LINES, KEPT APART FROM THE NOISE. The page prints one every PERF_EVERY
// world frames (renderer.js's `console.info(line)`), so a 60 s recording of an 18 fps
// window carries about nine of them and the LAST is the mean of the frames the profile
// also ended on. `logged` is capped at 40 lines of everything, which the game's own chat
// and audio chatter would fill before the first `[perf]` arrived.
const perfLines = [];
// `--browser` is a launch in the PLAYER'S browser: it navigates the page itself, so it
// waits for the world to settle like a launched window does. A true ATTACH is a tab
// already being played and is never navigated.
const OWN_BROWSER = !!BROWSER;
const ATTACH_URL = OWN_BROWSER ? `http://127.0.0.1:${CDP_PORT}` : ATTACH;
const TAKES_SETTLE = !ATTACH || OWN_BROWSER;

// Registered the moment the page exists and BEFORE it is navigated: a page's
// load-time errors are the most likely reason a world never settles, and a
// listener attached after `goto` would miss exactly those.
const watch = () => {
  page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
  page.on('console', (m) => {
    const text = m.text();
    // The GPU number first: it is the one line this file cannot reconstruct later.
    if (text.includes('[perf]') && perfLines.length < 500) perfLines.push(text.slice(0, 600));
    if (logged.length < 40) logged.push(`${m.type()}: ${text}`.slice(0, 240));
  });
};

try {
  if (OWN_BROWSER) {
    browser = await launchForAttach(BROWSER, CDP_PORT, ATTACH_WAIT);
    const ctx = browser.contexts()[0] ?? await browser.newContext();
    page = await ctx.newPage();
    tabUrl = URL_;
    watch();
    try {
      await page.goto(URL_);
    } catch (err) {
      throw new Error(`cpu: could not open ${URL_} - ${String(err?.message ?? err).trim()} Is the dev server running (npm run dev, PORT=${PORT})?`);
    }
    console.log(`cpu: ${BROWSER} is yours to play in - the page is loading`);
  } else if (ATTACH) {
    // The player's own browser: never navigated, and disconnected (not closed) at
    // the end.
    browser = await connectAttach(ATTACH, ATTACH_WAIT);
    const tab = await pickTab(browser);
    if (!tab) throw new Error(`cpu: ${ATTACH} has no tab to profile (TARGET= chooses one)`);
    page = tab.page;
    tabUrl = tab.url;
    watch();
    console.log(`cpu: attached to ${tabUrl}`);
  } else {
    if (PERSIST) {
      // --persist: the SAME profile every run, so the game's ARENA2 folder (attached
      // once in production) and the account's login are still there next time. Without
      // it Playwright hands out a fresh profile each run, which is why a launched
      // window kept landing on the login and the folder picker.
      const dir = join(tmpdir(), 'cpu-report-profile');
      // A persistent launch has no fallback of its own: it asks for the same build
      // number `launchBrowser` does, so the cached chromium (or CHROME=) is named here
      // too, or a machine without that exact build cannot use --persist at all.
      const exe = process.env.CHROME || cachedChromium()?.path;
      if (!exe) throw new Error('cpu: --persist needs a browser it can name - run `npx playwright install chromium`, or set CHROME=<path to chrome.exe>');
      browser = await chromium.launchPersistentContext(dir, {
        executablePath: exe,
        ...(HEADLESS ? { headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : { headless: false }),
        viewport: { width: 1280, height: 720 },
      });
      page = browser.pages()[0] ?? await browser.newPage();
      console.log(`cpu: profile kept at ${dir} - the game's data folder and your login stay between runs`);
    } else {
      browser = await launchBrowser(HEADLESS
        ? { headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
        : { headless: false });
      page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    }
    tabUrl = URL_;
    watch();
    try {
      await page.goto(URL_);
    } catch (err) {
      throw new Error(`cpu: could not open ${URL_} - ${String(err?.message ?? err).trim()} Is the dev server running (npm run dev, PORT=${PORT})?`);
    }
  }

  // WHEN IT WILL NOT SETTLE, LOOK RATHER THAN GUESS. A player's machine cannot be
  // driven from here: the world may be waiting on its data, sitting on a folder
  // picker, or drawing fine behind a flag this file does not know. So a failure
  // takes a picture of the page and reports what the page itself says - the fps
  // counter, whether a host is stamping frames, the overlays on screen.
  async function diagnose(what) {
    const state = await page.evaluate(() => {
      const s = globalThis.__fpsStats?.() ?? null;
      return {
        url: location.href,
        title: document.title,
        ready: document.readyState,
        counter: s,
        shotReady: globalThis.__shotReady ?? null,
        shotFrames: globalThis.__frame ?? null,
        canvases: [...document.querySelectorAll('canvas')].map((c) => `${c.width}x${c.height}`),
        overlayIds: [...document.querySelectorAll('body *[id]')].map((e) => e.id).filter((id) => /overlay|dialog|pick|gate|load|menu|veil|screen|prompt/i.test(id)).slice(0, 15),
        text: (document.body?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 400),
      };
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const png = `${OUT}-fail.png`;
    await page.screenshot({ path: png }).catch(() => {});
    console.error(`cpu: ${what}`);
    console.error(`   page: ${JSON.stringify(state, null, 2).split('\n').join('\n   ')}`);
    if (errors.length) console.error(`   page errors: ${errors.slice(0, 5).join(' | ')}`);
    const said = logged.filter((l) => !/^debug:/.test(l)).slice(-12);
    if (said.length) console.error(`   console: ${said.join('\n            ')}`);
    console.error(`   screenshot: ${png}`);
  }

  // The loading screen, dropped: settle, then let the stream's tail finish.
  if (TAKES_SETTLE) {
    console.log(`cpu: waiting for the world - ${URL_}`);
    const settled = await page.waitForFunction(READY, null, { timeout: READY_TIMEOUT })
      .then(() => true)
      .catch((err) => {
        // A timeout is the scene's answer; anything else is the EXPRESSION's, and
        // blaming the game for a typo in READY= is a lie the reader has no way
        // to detect.
        if (/timeout|timed out/i.test(err?.message ?? '')) return false;
        throw new Error(`cpu: READY is not a valid expression in the page: ${err?.message ?? err}`);
      });
    if (!settled) {
      await diagnose(`never settled in ${Math.round(READY_TIMEOUT / 1000)} s`);
      throw new Error('cpu: nothing was recorded - the page above is what the browser was showing. '
        + 'If it is a folder picker or an error, the game is not running yet, so there is no frame to sample. '
        + 'If the game IS running behind it, set READY=true and WARMUP=<seconds> to record anyway.');
    }
  }
  // An ATTACHED tab is already playing, so nothing is warmed up: the recording starts
  // at once, as the header promises. A LAUNCHED window takes the warmup - and says so
  // honestly, because with READY=true nothing was "settled", the clock was simply
  // started by hand and the player has this long to get into the game.
  if (TAKES_SETTLE && WARMUP) {
    console.log(READY === 'true'
      ? `cpu: ${WARMUP} s warmup - get into the world and play; the recording starts after it`
      : `cpu: settled - ${WARMUP} s of warmup, then recording`);
    await page.waitForTimeout(WARMUP * 1000);
  }

  // The frame the profile will be of - reported beside the function table so a
  // reader knows whether the milliseconds were even a problem.
  const stats = () => page.evaluate(() => (globalThis.__fpsStats ? globalThis.__fpsStats() : null)).catch(() => null);
  const before = await stats();

  // sample --------------------------------------------------------------------------------------
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: SAMPLING });
  // MEMORY: THE OTHER PROFILE THE SAME SESSION CAN TAKE. A CPU profile says where
  // the time goes and nothing about the heap, so the allocation sampler runs beside
  // it over the same window (a sampling profile: it records WHO allocated, in bytes,
  // by the JS stack at the allocation - the same shape as the CPU table) and the
  // heap's used/total are read either side of it for the growth over the recording.
  // A leak is not proven by a number here; a heap that climbs across a window where
  // nothing should have grown is the thing to look at. SNAPSHOT=1 adds the whole
  // heap - every live object, by constructor - as a DevTools file.
  const heapAt = async () => {
    if (!MEMORY) return null;
    const u = await cdp.send('Runtime.getHeapUsage').catch(() => null);
    return u ? { used: u.usedSize, total: u.totalSize, backing: u.backingStorageSize ?? 0 } : null;
  };
  const heapBefore = await heapAt();
  if (MEMORY) await cdp.send('HeapProfiler.enable').then(() => cdp.send('HeapProfiler.startSampling', { samplingInterval: HEAP_SAMPLING })).catch(() => {});
  console.log(`cpu: recording ${SECONDS} s - play now (the window closes itself at the end)`);
  await cdp.send('Profiler.start');
  try {
    await page.waitForTimeout(SECONDS * 1000);
  } catch {
    throw new Error(`cpu: the window closed before the ${SECONDS} s recording finished - nothing was written. Leave it open for the whole recording, or lower SECONDS.`);
  }
  const { profile } = await cdp.send('Profiler.stop');
  const heapAfter = await heapAt();
  const allocs = MEMORY ? await cdp.send('HeapProfiler.stopSampling').then((r) => r?.profile ?? null).catch(() => null) : null;
  let snapBytes = 0;
  if (SNAPSHOT) {
    // STREAMED TO DISK, NEVER BUFFERED. A city's heap makes a snapshot of hundreds of
    // MB to gigabytes; collecting the chunks in an array and joining them (the first
    // cut of this) held the whole file in memory a second time on top of the browser's
    // own snapshot, and that is a machine short of RAM losing the tab. Each chunk goes
    // straight to the file, and nothing here keeps it.
    const { createWriteStream } = await import('node:fs');
    const path = `${OUT}.heapsnapshot`;
    const file = createWriteStream(path);
    const take = (e) => { snapBytes += e.chunk.length; file.write(e.chunk); };
    cdp.on('HeapProfiler.addHeapSnapshotChunk', take);
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false }).catch(() => {});
    cdp.off('HeapProfiler.addHeapSnapshotChunk', take);
    await new Promise((done) => file.end(done));
    console.log(`cpu: heap snapshot ${fbytes(snapBytes)} - a big heap makes a file several times its size, so keep --snapshot off when RAM is short`);
  }
  console.log('cpu: recording stopped - ranking the samples');
  const after = await stats();
  await cdp.send('Profiler.disable');

  const { list, totalUs, wallSeconds, samples } = aggregate(profile);
  const fps = after?.fps ?? before?.fps ?? null;
  // Frames in the window the profiler ACTUALLY covered, not the one that was asked
  // for: `ms/frame` would otherwise be scaled by the difference between them.
  const frames = fps ? fps * (wallSeconds || SECONDS) : 0;
  const game = list.filter((r) => r.game);
  // Everything that is not one of V8's own buckets came out of a JavaScript file -
  // the game's source, its bundle, or a dependency. That is what the last guard asks
  // about, because "the game was not running" and "the game was running but bundled"
  // are different answers and only the first is a fault.
  const jsRows = list.filter((r) => !r.file.startsWith('('));
  // A percentage of a window a page spent asleep is a percentage of nothing: the
  // sampler counts `(idle)` too, and a paused or backgrounded tab reads as 97%
  // idle with every real frame scaled to a rounding error. So idle is its own
  // number in the header and is out of both tables' denominators.
  const idleUs = list.filter((r) => r.fn === '(idle)').reduce((a, r) => a + r.us, 0);
  const activeUs = Math.max(1, totalUs - idleUs);
  const idleShare = pct(idleUs, totalUs);
  const gameUs = game.reduce((a, r) => a + r.us, 0);
  const gameShare = pct(gameUs, activeUs);
  // `active` is the whole denominator's own list, so ALL=1 cannot print an
  // `(idle)` row at a thousand percent of a base that excludes it.
  const active = list.filter((r) => r.fn !== '(idle)');
  const rest = active.filter((r) => !r.game);
  const sleeping = idleShare > 50;
  // While a page is mostly asleep, `ms/frame` divides a real millisecond by a frame
  // that mostly did not happen: the column would read 0.00 beside a "60 fps" header.
  const perFrame = sleeping ? 0 : frames;
  // THE NUMBER THIS FILE CANNOT MEASURE. A CPU profile of the main thread says nothing
  // about the GPU, so the page's own `[perf]` line (EXT_disjoint_timer_query_webgl2) is
  // the only clock on that side. Beside the JS this profile DID measure it answers the
  // question a reader of a 56 ms frame asks first: is there anything to win here at all?
  const perf = parsePerf(perfLines);
  const jsPerFrame = frames ? ms(gameUs) / frames : null;
  const frameMs = after?.meanMs ?? before?.meanMs ?? null;
  // A VERDICT NEEDS A WORLD THAT IS RUNNING. `fps` is the PAGE's own counter: a menu, a
  // character guide or a paused game draws a handful of frames with no host stamping any,
  // and dividing the game's JS by eleven frames of a paused page names a bottleneck that
  // is not there (measured on the new-character guide: 1 fps, "game JS 122 ms", reported
  // as JavaScript-bound).
  // THE IDLE SHARE IS NOT THE TEST. A frame waiting on the GPU leaves the main thread idle
  // by definition, so a GPU-bound window reads as half asleep - the 2026-10-19 town profile
  // (19 fps, GPU 53.4 ms, idle 51.9%) lost its split to exactly that, and the reader was told
  // "the page was not drawing steadily" about a page drawing a town. Drawing is what the
  // counter and its frame count say, not what the sampler's idle column says.
  const notDrawing = !frames || frames < 20 || fps == null || fps < 5;
  const bottleneck = notDrawing ? null : bottleneckOf(perf?.gpuMs ?? null, jsPerFrame);
  // WHY THE SPLIT WAS NOT READ, WHEN IT WAS NOT. Three different nulls, three different sentences: a
  // browser refusing its timer, a page with no `&fps` counter, and a window that was not drawing are
  // not the same fault, and blaming "the page was not drawing" for a refused timer sends a reader
  // after a paused game that never existed.
  const whyNoSplit = notDrawing
    ? ['the page was not drawing a world (its own fps counter read under 5, or the window held fewer than 20',
      'frames), so a GPU mean and a JavaScript mean are of different things - record inside a running world.']
    : !perf
      ? ['no `[perf]` line reached this report, so nothing here can say whether the frame is the GPU or the',
        'JavaScript - the profile can only see the main thread.']
      : perf.gpuMs == null && perf.cpuMs != null
        ? ['the page\'s `[perf]` line is a MAIN-THREAD tiling (`?perf=cpu`), not the GPU clock, so there is no',
          'GPU number to compare the JavaScript against.']
        : jsPerFrame == null
          ? ['the page carried no `&fps` counter, so there is no per-frame JavaScript to divide.']
          : ['the page\'s GPU timer answered n/a (the browser refused EXT_disjoint_timer_query_webgl2), so the',
            'JavaScript column is the only clock this window has.'];

  // the report ----------------------------------------------------------------------------------
  const modules = new Map();
  for (const r of game) modules.set(r.file, (modules.get(r.file) ?? 0) + r.us);
  const moduleRows = [...modules.entries()].sort((a, b) => b[1] - a[1]);
  const alloc = aggregateAlloc(allocs);
  const grew = heapBefore && heapAfter ? heapAfter.used - heapBefore.used : null;

  const lines = [
    `# CPU report - ${tabUrl} ${new Date().toISOString()}`,
    '',
    `${f(SECONDS)} s requested, ${f(wallSeconds)} s profiled at ${SAMPLING} µs, ${samples} samples${fps ? `, ${f(fps, 0)} fps (${f(after?.meanMs ?? before?.meanMs ?? 0)} ms a frame, script ${f(after?.scriptMs ?? before?.scriptMs ?? 0)} ms)` : ''}`,
    `Idle: ${f(idleShare)}% of the window${sleeping ? ' - **the page was not drawing for most of it: the numbers below are of the little that ran**' : ''}`,
    `Game code (\`src/\`): **${f(gameShare)}%** of the active time${errors.length ? ` - ${errors.length} page errors` : ''}`,
    ...(heapBefore ? [`Heap: ${fbytes(heapBefore.used)} used of ${fbytes(heapBefore.total)} at the start, ${fbytes(heapAfter?.used ?? heapBefore.used)} of ${fbytes(heapAfter?.total ?? heapBefore.total)} at the end${grew == null ? '' : ` (**${grew >= 0 ? '+' : ''}${fbytes(grew)}** over the window)`}`] : []),
    '',
    'Self time is a function\'s own body, not its callees: it is the milliseconds an',
    'optimisation can take back. Shares are of the ACTIVE time (idle excluded), so a',
    'table\'s column of them is that table\'s slice of the frame, not 100%.',
    fps
      ? `\`ms/frame\` is that function\'s share of one frame at the measured ${f(fps, 0)} fps.`
      : '`ms/frame` is empty: put `&fps` on the URL and the counter reports the frame this is a share of.',
    '',
    ...(perf ? [
      '## The frame: GPU or JS',
      '',
      '`?perf` is the port\'s own GPU clock - the number a main-thread CPU profile cannot',
      'see - printed beside the JavaScript this profile did measure. Read it first: it says',
      'whether the tables below can help at all.',
      '',
      '| measure | value |',
      '|---|---|',
      `| ${perf.cpuMs != null && perf.gpuMs == null ? 'CPU a frame (the page\'s `?perf=cpu`)' : 'GPU a frame (the page\'s `?perf`)'} | ${perf.gpuMs != null ? `${f(perf.gpuMs, 2)} ms` : perf.cpuMs != null ? `${f(perf.cpuMs, 2)} ms` : 'n/a - the browser refused the timer'} |`,
      `| game JS a frame (this profile) | ${jsPerFrame == null ? 'n/a - no fps counter on the page' : `${f(jsPerFrame, 2)} ms`} |`,
      `| frame (the page\'s counter) | ${frameMs == null ? 'n/a' : `${f(frameMs, 2)} ms`} |`,
      ...(perf.counts.length ? [`| the lane\'s counts | ${perf.counts.join(', ')} |`] : []),
      `| \`[perf]\` lines seen in the window | ${perf.seen} |`,
      '',
      ...(bottleneck ? [bottleneck.text, ''] : ['Not read from this window:', ...whyNoSplit, '']),
      ...(perf.zones.length ? [
        '### GPU by pass (the `?perf=zones` tiling)',
        '',
        '| ms | pass |',
        '|---:|---|',
        ...perf.zones.sort((a, b) => b[1] - a[1]).map(([name, v]) => `| ${f(v, 2)} | ${name} |`),
        '',
      ] : []),
    ] : [
      '## The frame: GPU or JS',
      '',
      'No `[perf]` line reached this report, so nothing here can say whether the frame is',
      'the GPU or the JavaScript - the profile can only see the main thread. Every URL this',
      'file builds carries `&perf` (turn it off with `--no-perf`); a run started from',
      '`--url` or an `--attach`ed tab needs `&perf` on the page it is playing.',
      '',
    ]),
    `## Hot functions${ALL ? '' : ' in the game\'s own code'}`,
    '',
    table((ALL ? active : game).slice(0, 40), activeUs, perFrame),
    '',
    '## By module',
    '',
    '| self ms | % | module |',
    '|---:|---:|---|',
    ...moduleRows.slice(0, 20).map(([file, us]) => `| ${f(ms(us))} | ${f(pct(us, activeUs))} | ${file} |`),
    '',
    ...(alloc ? [
      '## Allocation (self, by the function that allocated)',
      '',
      `Sampled every ${fbytes(HEAP_SAMPLING)} of heap: **${fbytes(alloc.total)}** attributed over the window. This is`,
      'WHO ALLOCATED, in the same shape as the table above - not what the heap holds.',
      'For the objects themselves (counts and shallow sizes by constructor) take a',
      'snapshot: `SNAPSHOT=1` and open it in DevTools > Memory > Load.',
      '',
      '| bytes | % | function | where |',
      '|---:|---:|---|---|',
      ...alloc.list.slice(0, 25).map((r) => `| ${fbytes(r.bytes)} | ${f(pct(r.bytes, alloc.total))} | \`${r.fn}\` | ${at(r)} |`),
      '',
    ] : []),
    '## Everything else',
    '',
    'The browser, the GL driver, V8, the deps - what is left of the active time once',
    'the game\'s own code is taken out. `(native)` rows are calls into the browser and',
    'the GL driver, so a big `(native)` entry with the game\'s code flat is a',
    'GPU/driver-bound frame: read `?perf=zones` for which pass. `(v8: program)` is',
    'time outside any JS function and `(v8: gc)` is the collector - neither is GL.',
    '',
    table(rest.slice(0, 12), activeUs, perFrame),
    '',
  ];
  writeFileSync(`${OUT}.md`, lines.join('\n'));
  writeFileSync(`${OUT}.cpuprofile`, JSON.stringify(profile));

  // The console half: the same ranking, short enough to read while it is hot.
  const show = (ALL ? active : game).slice(0, 20);
  console.log(`cpu: ${f(wallSeconds)} s profiled, ${samples} samples, ${fps ? `${f(fps, 0)} fps` : 'fps unknown'}, idle ${f(idleShare)}%, game code ${f(gameShare)}% of active time`);
  if (heapBefore) console.log(`cpu: heap ${fbytes(heapBefore.used)} of ${fbytes(heapBefore.total)} -> ${fbytes(heapAfter?.used ?? heapBefore.used)}${grew == null ? '' : ` (${grew >= 0 ? '+' : ''}${fbytes(grew)} over the window)`}`);
  // The GPU line, before the function table: it is what says whether the table matters.
  if (perf?.gpuMs != null) {
    console.log(`cpu: gpu ${f(perf.gpuMs, 2)} ms a frame vs game JS ${jsPerFrame == null ? '?' : f(jsPerFrame, 2)} ms${frameMs == null ? '' : ` (frame ${f(frameMs, 2)} ms)`}${bottleneck ? ` - ${bottleneck.side}` : ' - no verdict: the page was not drawing steadily'}`);
    if (perf.zones.length) {
      const zones = [...perf.zones].sort((a, b) => b[1] - a[1]);
      console.log(`cpu: gpu by pass - ${zones.map(([name, v]) => `${name} ${f(v, 2)}`).join(', ')}`);
    }
  } else if (perf?.cpuMs != null) {
    console.log(`cpu: the page's \`[perf]\` is a main-thread tiling (\`?perf=cpu\`): ${f(perf.cpuMs, 2)} ms a frame - no GPU number in this window`);
  } else if (perf) {
    console.log('cpu: the page printed a `[perf]` line but the GPU timer read n/a - the browser refused EXT_disjoint_timer_query_webgl2, so the JS column is the only clock');
  } else if (PERF) {
    console.warn('cpu: no `[perf]` line in the window - the meter prints one every 120 world frames, so a very short or very slow window can end before the first');
  }
  if (sleeping) console.warn('cpu: more than half the window was idle - the page was not drawing frames; is the game paused, or the tab hidden?');
  for (const r of show) console.log(`  ${f(ms(r.us)).padStart(8)} ms  ${f(pct(r.us, activeUs)).padStart(5)}%  ${r.fn}  ${at(r)}`);
  if (alloc) {
    console.log(`cpu: allocated ${fbytes(alloc.total)} - top by function:`);
    for (const r of alloc.list.slice(0, 8)) console.log(`  ${fbytes(r.bytes).padStart(9)}  ${f(pct(r.bytes, alloc.total)).padStart(5)}%  ${r.fn}  ${at(r)}`);
  }
  console.log(`cpu: wrote ${OUT}.md and ${OUT}.cpuprofile (drag the profile into DevTools > Performance > Load profile)`);
  if (snapBytes) console.log(`cpu: wrote ${OUT}.heapsnapshot (${fbytes(snapBytes)}) - DevTools > Memory > Load, then sort by shallow size`);

  // The judgement: a report of nothing is not a measurement. A profile with no
  // samples means the page was not running (paused, or the tab was backgrounded
  // and its frames stopped) - printing an empty table and exiting 0 would read as
  // "the game costs nothing".
  if (!samples) throw new Error('cpu: the profiler returned no samples - the page was not running frames (a breakpoint, or a backgrounded tab)');
  // Only "no JavaScript at all" is a fault. A world CAN be running in a bundled build
  // (`/assets/main-<hash>.js`, the deployed site) and the first cut of this refused
  // exactly that - a real snowy world, reported as "game code 0.0%".
  if (!jsRows.length && !ALL) {
    throw new Error('cpu: not one JavaScript frame was sampled - the page never ran the game at all '
      + '(still at a menu, a login, or the game data folder prompt?). '
      + 'Walk into the world inside the warmup, or point the run at the dev server (where the source names are readable).');
  }
  if (!game.length && !ALL) {
    console.warn('cpu: the game ran, but from a BUNDLE (/assets/main-*.js): the numbers are real and the function names are minified. Profile the dev server (`npm run dev`, no --base) for readable names.');
  }
} finally {
  // One exit for every path, including the throws above: a launched browser is
  // closed, a connected one DISCONNECTED (the docs' own behaviour for a browser a
  // session is connected to) - the player's Chrome and its tabs are left standing,
  // which is the point of attaching. The process then exits rather than leaving a
  // websocket holding a loop open.
  if (browser) await browser.close().catch((err) => console.warn(`cpu: could not let go of the browser: ${err?.message ?? err}`));
}
