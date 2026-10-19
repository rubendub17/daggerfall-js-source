// BENCH1 - THE TRACK AUTHOR (2026-10-19). The benchmark's city leg is a WALK
// through a town, and a route nobody has walked is a benchmark of a bot
// standing in a wall: the frame numbers that follow would be the frame time of
// a character pressing its nose into a door, and the result would read as
// "this machine runs Daggerfall at 200 fps" when what it measured was a
// collider. So the route is authored ONCE, here, on a machine that has a GPU
// and an ARENA2, by a bot that walks it with the player's own key.
//
// WHAT IT DOES, IN ORDER.
//   1. Boot the pinned capital (BENCH_PINS, systems/bench/law.js) and wait for
//      the stream to settle - `__streamIdle()` true, then a few frames drawn.
//      The URL is the pins and nothing else: it carries `class=` (without it
//      the chargen wizard holds the overlay slot and swallows every key - T2's
//      own lesson) and no `bench=` (this page is not running the benchmark).
//   2. Read `window.__doors()`. The town's centre is the doors' own mean; the
//      walk starts at the door nearest it, and each step goes to the nearest
//      door not yet visited. A step longer than MAX_SEGMENT_M is halved and
//      halved again - a midpoint at the halfway point - until every segment is
//      one a corner can be steered inside, so the route is walkable by
//      construction. At most 40 waypoints, at least 120 m of run.
//   3. WALK IT. One warp places the character on waypoint 0, the look facing
//      waypoint 1; after that the only body in the town is the player's own.
//      Per leg: hold W with `page.keyboard` (the real input route - the key
//      travels the host's held set, the action registry and the motor), aim the
//      look at the waypoint through the page's `__look` hook once per poll, and
//      read `window.__player.pos` until the waypoint is within REACH_M or the
//      leg's deadline passes. A leg nobody reaches is a route nobody can walk,
//      and it exits non-zero naming the waypoint.
//   4. Screenshot every waypoint to tools/shots/bench-track-<i>.png (that
//      directory is gitignored). A route can be walkable and still wrong - the
//      pictures are what a human rejects it by.
//   5. Write src/systems/bench/tracks.js in the shape that module already ships
//      (a frozen BENCH_TRACKS of frozen [x, y, z] lists, one line a waypoint),
//      and only when every leg was reached. Its header names this tool as the
//      writer and the run's own length, so a regeneration is a diff of numbers.
//
// THE y IS THE GROUND THE FEET STOOD ON. A waypoint's height is read back from
// `__player.pos` where the walk actually stood - the door's own y is only what
// waypoint 0 is warped to, and the reading replaces it. Nothing here invents a
// height, and systems/bench/track.js steers horizontally anyway: the y is the
// ground a run's character is placed on, not what she is steered by.
//
// Run (the flag reads the same in cmd and PowerShell - tools/cpuReport.mjs's
// lesson; the env spelling is tools/perfProbe.mjs's):
//   npm run tracks -- --headed      a real GPU (else SwiftShader software GL)
//   HEADED=1 npm run tracks         the same
//   --port 5239 / PORT=5239         the dev server's port (5238)
//   --out <path> / OUT=<path>       the module written (src/systems/bench/tracks.js)
//   --shots <dir> / SHOTS=<dir>     the waypoint shots (tools/shots)
//
// There is no ARENA2 in a checkout without the game data, so this tool cannot be
// run here and no test imports it: test/tooling/benchtracks.test.js pins it as
// TEXT for exactly that reason - importing it would launch a browser and boot a
// city.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  MAX_SEGMENT_M, MIN_SEGMENT_M, REACH_M, bearingTo, distanceTo, trackLength, validateTrack,
} from '../src/systems/bench/track.js';
import { BENCH_PINS } from '../src/systems/bench/law.js';
import { launchChromium } from './lib/browser.mjs';   // BENCH1: the ladder that finds the browser this machine actually has

// FLAGS FIRST, SO NOBODY HAS TO KNOW THEIR SHELL. A flag reads the same in cmd and
// in PowerShell; an env spelling is kept because tools/perfProbe.mjs has used
// HEADED=1 for years and two tools that disagree about how to ask for a GPU are
// two runs nobody can compare.
const FLAGS = { '--port': 'PORT', '--out': 'OUT', '--shots': 'SHOTS' };
const SWITCHES = { '--headed': ['HEADED', '1'] };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (FLAGS[a]) { process.env[FLAGS[a]] = process.argv[++i] ?? ''; continue; }
  if (SWITCHES[a]) { process.env[SWITCHES[a][0]] = SWITCHES[a][1]; continue; }
  if (a.startsWith('--')) throw new Error(`tracks: unknown flag ${a} - one of ${[...Object.keys(FLAGS), ...Object.keys(SWITCHES)].join(' ')}`);
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** The dev server the page is served from. A SECOND port matters: a `npm run dev` tab
 *  is a server this tool must not fight, and a fixed port keeps the page's URL printable. */
const PORT = Number(process.env.PORT || 5238);
/** A real GPU, or SwiftShader. The route does not depend on which, but the walk's frame
 *  rate does, and a software rasteriser makes a 40 m leg a slow walk - it is still a walk. */
const HEADED = process.env.HEADED === '1';
/** The module this tool owns. Its DEFAULT is the shipped file, so `npm run tracks` writes
 *  the one the game reads, and there is no second copy to fall out of date. */
const OUT = process.env.OUT || 'src/systems/bench/tracks.js';
/** Where the waypoint shots go. tools/shots/ is gitignored: these are for an eye, not a diff. */
const SHOTS = process.env.SHOTS || 'tools/shots';
const OUT_PATH = resolve(ROOT, OUT);
const SHOTS_DIR = resolve(ROOT, SHOTS);

/** A track is a walk, not a tour: past this many waypoints a run is a different benchmark. */
const MAX_WAYPOINTS = 40;
/** The shortest run this tool will call a track, in metres - one street is a station, not a walk. */
const MIN_RUN_M = 120;
/** How long one leg is given, per metre of it, and the ends of that: a character walks at
 *  systems/bench/track.js's terms - around 3 m/s - so 1.5 s a metre is a generous floor that
 *  still fails a leg nobody can walk instead of waiting for a corner to be turned forever. */
const LEG_MS_PER_M = 1500;
const LEG_MS_MIN = 10000;
const LEG_MS_MAX = 60000;
/** How often the walk reads the feet while W is held, ms: a quarter of a metre at a walk. */
const POLL_MS = 100;
/** The city's boot is a stream, and SwiftShader's first stream of the capital is minutes. */
const SETTLE_MS = 300000;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error(`tracks: PORT must be a port number, not ${process.env.PORT}`);

/** A number as the emitted module writes it: two decimals, always, so a regeneration is a
 *  diff of numbers and never a diff of spellings. */
const n2 = (v) => (Math.round(Number(v) * 100) / 100).toFixed(2);

/**
 * THE SETTLE TEST, run in the page: the stream queue is empty, nothing is building, nothing
 * is in flight (`src/scenes/world.js`), and a handful of frames have been drawn since the
 * boot - a world that has not stamped a frame yet has not been seen at all.
 * @returns {boolean}
 */
function settled() {
  return globalThis.__frame > 5
    && typeof globalThis.__streamIdle === 'function'
    && globalThis.__streamIdle() === true;
}

// the browser ---------------------------------------------------------------------------------
// THE MACHINE'S OWN BROWSER, the same ladder tools/benchmark.mjs launches (tools/lib/browser.mjs):
// CHROME=, then the OS's default browser by its own registry answer, then playwright's bundled
// build, then the installed Chrome/Edge by channel, then its cache, then the well-known paths.
// Copied lookups are how `npm run tracks` came to fail where `npm run perf` worked - one ladder,
// imported, so a machine is found the same way by every tool.
async function launchBrowser(opts) {
  const { browser, label } = await launchChromium(chromium, opts, {
    onTry: (label_, err) => console.log(`tracks: ${label_} would not launch - ${String(err?.message ?? err).trim().split('\n')[0]}`),
  });
  console.log(`tracks: browser - ${label}`);
  return browser;
}

// the route ------------------------------------------------------------------------------------
/**
 * One step of the greedy walk, sub-divided until it is walkable: a leg longer than
 * MAX_SEGMENT_M is split at its halfway point, and each half is asked the same question -
 * which is the validator's own rule (systems/bench/track.js validateTrack) applied by halving,
 * not a second opinion about how long a segment may be. Stops at MAX_WAYPOINTS.
 * @param {Array<{x:number,y:number,z:number}>} out the waypoints so far, appended to
 * @param {{x:number,y:number,z:number}} from where the walk already stands
 * @param {{x:number,y:number,z:number}} to the door this step is for
 */
function pushStep(out, from, to) {
  if (out.length >= MAX_WAYPOINTS) return;
  if (distanceTo(from, to) <= MAX_SEGMENT_M) { out.push(to); return; }
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2, door: null };
  pushStep(out, from, mid);
  pushStep(out, mid, to);
}

/**
 * Turn a town's doors into a walk: the door nearest the town's centre first, then a greedy
 * nearest-neighbour sweep of the doors not yet visited, with every too-long step halved into
 * walkable ones. Doors sharing a metre are one station (MIN_SEGMENT_M is the validator's own
 * floor, and a duplicate door is not a waypoint).
 * THE TOWN'S CENTRE IS THE DOORS' OWN MEAN - the author has no other reading of it, and every
 * door it is given is a door of this town. With no doors there is no walk, and `why` says so.
 * @param {Array<{ i?: number, pos: number[] }>} doors `window.__doors()` of the pinned capital
 * @returns {{ points: Array<{x:number,y:number,z:number,door:number|null}>, why: string }}
 */
function planRoute(doors) {
  const doors01 = [];
  for (const d of Array.isArray(doors) ? doors : []) {
    const p = d?.pos;
    const x = Number(p?.[0]);
    const z = Number(p?.[2]);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const point = { x, y: Number.isFinite(Number(p?.[1])) ? Number(p[1]) : 0, z, door: Number.isInteger(d?.i) ? d.i : null };
    if (doors01.some((q) => distanceTo(q, point) < MIN_SEGMENT_M)) continue;   // the same address, twice
    doors01.push(point);
  }
  if (!doors01.length) return { points: [], why: 'the town reported no door this author can walk from' };

  let cx = 0;
  let cz = 0;
  for (const p of doors01) { cx += p.x; cz += p.z; }
  const centre = { x: cx / doors01.length, z: cz / doors01.length };

  let start = doors01[0];   // no centre, no nearest - the first door is the answer
  let nearest = Infinity;
  for (const p of doors01) {
    const d = distanceTo(centre, p);
    if (d < nearest) { nearest = d; start = p; }
  }

  const points = [start];
  const left = doors01.filter((p) => p !== start);
  while (left.length && points.length < MAX_WAYPOINTS) {
    let pick = -1;
    let best = Infinity;
    for (let k = 0; k < left.length; k++) {
      const d = distanceTo(points[points.length - 1], left[k]);
      if (d < best) { best = d; pick = k; }
    }
    if (pick < 0) break;
    const next = left.splice(pick, 1)[0];
    if (best >= MIN_SEGMENT_M) pushStep(points, points[points.length - 1], next);   // else: the station we stand on
  }
  return {
    points,
    why: `${doors01.length} doors, ${points.length} waypoints by nearest neighbour from the door nearest the centre`,
  };
}

// the module the author owns -------------------------------------------------------------------
/**
 * THE EMITTED FILE, as text: the header that names this tool as the writer and the run's own
 * length, then the one shape src/systems/bench/tracks.js ships - `export const BENCH_TRACKS =
 * Object.freeze({`, the pinned place's own frozen list, and one `Object.freeze([x, y, z])` a
 * waypoint so a human reads the walk down the page. Data and nothing else: no import, no code,
 * so importing the module can never launch anything.
 * @param {Array<number[]>} points the walked waypoints, in order
 * @param {{ walked:number, length:number }} run what the walk measured, in metres
 * @returns {string} the whole file
 */
function tracksModuleText(points, run) {
  const rows = points.map((p) => `    Object.freeze([${p.map(n2).join(', ')}]),`);
  const header = [
    '// BENCH1 - THE BENCHMARK\'S TRACKS (2026-10-19), WRITTEN BY tools/benchTracks.mjs.',
    '//',
    '// A benchmark\'s city leg is a WALK, and a route nobody has walked is a benchmark of a',
    '// bot standing in a wall: the numbers that follow would be the frame time of a character',
    '// pressing its nose into a door. So this list is not a set of coordinates - it is the walk',
    `// tools/benchTracks.mjs took in ${BENCH_PINS.loc} on the run that wrote it: the town's doors`,
    '// laid out nearest-neighbour from the middle of town, no step longer than the track law\'s',
    '// 40 m, and every waypoint reached with W held down rather than a teleport per waypoint.',
    `// That run walked ${n2(run.walked)} m over ${points.length} waypoints, ${n2(run.length)} m of route.`,
    '//',
    '// DO NOT EDIT BY HAND. Regenerate with `npm run tracks -- --headed` (a real GPU, which is',
    '// the only run worth trusting for the walk\'s timing) or `HEADED=1 npm run tracks`; the',
    '// emitted shape is the shape this module ships with, so a regeneration is a diff of numbers.',
    '//',
    '// ONE LINE A WAYPOINT: [x, y, z], where the y is the ground the author\'s feet stood on at',
    '// that waypoint - the walk\'s own reading, never an estimate. systems/bench/track.js steers',
    '// horizontally, so the y is where a run is placed, not what it turns by.',
    '//',
    '// A PLACE WITH NO TRACK IS A LEG THAT MUST REPORT ITSELF UNRUN. An empty map here is not a',
    '// finished benchmark: systems/bench/bot.js would have nothing to walk, and the run must say',
    '// "no track for this place" rather than boot a city and stand still - a leg that never moved',
    '// is a frame number nobody should believe.',
  ].join('\n');
  return `${header}

export const BENCH_TRACKS = Object.freeze({
  ${BENCH_PINS.region}: Object.freeze([
${rows.join('\n')}
  ]),
});
`;
}

// the run --------------------------------------------------------------------------------------
const server = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
let browser = null;
/** The page's own errors. A world that threw is not a route, whatever the walk did. */
const errors = [];
/** The waypoints, and the y the walk found under each. Filled inside the try, judged below. */
let route = [];
/** One row a waypoint: what the walk did on the way to it. */
const legs = [];
/** The waypoint the bot never got to, or null - the one failure a walk can have of its own. */
let unreached = null;

try {
  browser = await launchBrowser(HEADED
    ? { headless: false }
    : { headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // Registered before the navigation: a page's load-time errors are the likeliest reason a
  // world never settles, and a listener attached after `goto` would miss exactly those.
  page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

  console.log(`tracks: booting ${BENCH_PINS.loc} (${BENCH_PINS.region}) at ${BENCH_PINS.tod}, ${BENCH_PINS.weather}, seed ${BENCH_PINS.wseed}`);
  // THE ONE URL OF THE AUTHOR'S RUN. `class=` is not decoration (T2: without it the chargen
  // wizard mounts, holds the overlay slot and swallows every W this tool presses), and `bench=`
  // is absent on purpose - this page measures nothing, it walks. `?shot` installs the probe
  // surface and `?play` keeps the motor on, so the thing that walks is the game's own player.
  await page.goto(`http://localhost:${PORT}/play/?world&class=${encodeURIComponent(BENCH_PINS.classId)}&region=${encodeURIComponent(BENCH_PINS.region)}&loc=${encodeURIComponent(BENCH_PINS.loc)}&tod=${encodeURIComponent(BENCH_PINS.tod)}&weather=${encodeURIComponent(BENCH_PINS.weather)}&wseed=${encodeURIComponent(BENCH_PINS.wseed)}&shot&play&fps`);

  /** The feet, as systems/bench/track.js measures them: horizontal, from the page's own body. */
  const feetNow = () => page.evaluate(() => {
    const pl = globalThis.__player;
    return pl && Array.isArray(pl.pos) ? pl.pos.slice(0, 3) : null;
  });
  /** Turn the look, not the body. The yaw is the hosts' own bearing (track.js bearingTo). */
  const aim = (yaw) => page.evaluate((y) => { globalThis.__look(y, 0); }, yaw);
  /** A waypoint's picture, and the path the report prints - gitignored either way. */
  const shoot = async (i) => {
    await page.screenshot({ path: join(SHOTS_DIR, `bench-track-${i}.png`) });
    return `${SHOTS}/bench-track-${i}.png`;
  };
  /** Frame-sync, never sleep: the process doctrine, and the world's own counter. */
  const frames = async (n) => {
    const from = await page.evaluate(() => (typeof globalThis.__frame === 'number' ? globalThis.__frame : 0));
    try {
      await page.waitForFunction(([f, k]) => (globalThis.__frame ?? 0) >= f + k, [from, n], { timeout: 60000 });
    } catch {
      const seen = await page.evaluate(() => (typeof globalThis.__frame === 'number'
        ? `its __frame is stuck at ${globalThis.__frame}`
        : 'it carries no __frame counter at all'));
      throw new Error(`tracks: the page drew no frames - ${seen}, so there is no town to read`);
    }
  };

  // 1. THE SETTLE. A city that never settled is a city that is still streaming: the doors it
  // has now are not the doors it will have, and a route over a half-built town is a guess.
  try {
    await page.waitForFunction(settled, null, { timeout: SETTLE_MS });
  } catch (err) {
    if (!/timeout|timed out/i.test(err?.message ?? '')) throw err;   // a page that died is not a slow stream
    throw new Error(`tracks: the city never settled in ${Math.round(SETTLE_MS / 1000)} s - `
      + `${errors.length ? `the page threw: ${errors.slice(0, 3).join(' | ')}` : 'no page error, so the stream itself never drained'}`);
  }
  await frames(4);
  const mode = await page.evaluate(() => (typeof globalThis.__mode === 'function' ? globalThis.__mode() : null));

  // 2. THE SURFACE, ASKED FOR BEFORE IT IS USED. A page without it would answer `undefined` for
  // every read and read as a town with no doors.
  const hooks = await page.evaluate(() => ({
    doors: typeof globalThis.__doors === 'function',
    warp: typeof globalThis.__warpTo === 'function',
    look: typeof globalThis.__look === 'function',
    feet: !!globalThis.__player && Array.isArray(globalThis.__player.pos),
  }));
  const missing = Object.entries(hooks).filter(([, there]) => !there).map(([name]) => name);
  if (missing.length) {
    throw new Error(`tracks: the page carries no ${missing.join(', ')} - a ?shot&play world installs doors, warp, look and feet; `
      + 'without them there is nothing to read the town by');
  }

  // 3. THE DOORS, AND THE WALK THEY BECOME.
  const doors = await page.evaluate(() => globalThis.__doors());
  const planned = planRoute(doors);
  route = planned.points;
  console.log(`tracks: ${BENCH_PINS.loc} is in mode ${mode ?? '?'}; ${planned.why}`);
  if (route.length < 2) throw new Error(`tracks: ${planned.why} - ${route.length} waypoint(s) is a place, not a walk`);
  const plannedOk = validateTrack(route.map((p) => [p.x, p.y, p.z]));
  if (!plannedOk.ok) throw new Error(`tracks: the planned route is not a track the bot could walk: ${plannedOk.why}`);

  // 4. THE WALK. One warp, to waypoint 0 only: it is the only time this tool moves a body. Every
  // other waypoint is reached by holding W, and the key is released on every path out of a leg -
  // a held key with no hand on it is the disease systems/bench/bot.js guards too. The shots need
  // their directory made first: page.screenshot writes a file and never a folder.
  mkdirSync(SHOTS_DIR, { recursive: true });
  const yaw0 = bearingTo(route[0], route[1]);
  await page.evaluate(([p, y]) => globalThis.__warpTo(p, y), [[route[0].x, route[0].y, route[0].z], yaw0]);
  await frames(4);
  const landing = await feetNow();
  if (!landing) throw new Error('tracks: the page has no window.__player.pos - the walk has no feet to read');
  route[0].y = landing[1];   // the ground under waypoint 0, read back off the warp
  legs.push({ i: 0, walked: 0, gap: 0, shot: await shoot(0) });
  console.log(`tracks: warped to waypoint 0 at ${route[0].x.toFixed(1)}, ${route[0].y.toFixed(1)}, ${route[0].z.toFixed(1)} - walking ${route.length - 1} legs`);

  for (let i = 1; i < route.length && unreached === null; i++) {
    const target = route[i];
    let prev = await feetNow();
    if (!prev) { unreached = i; break; }
    const gap = distanceTo(prev, target);
    const deadline = Date.now() + Math.min(LEG_MS_MAX, Math.max(LEG_MS_MIN, Math.round(gap * LEG_MS_PER_M)));
    let walked = 0;
    let reached = false;
    await page.keyboard.down('KeyW');
    try {
      while (Date.now() < deadline) {
        await aim(bearingTo(prev, target));   // the look turns toward the waypoint; the legs do the walking
        const at = await feetNow();
        if (!at) break;
        walked += distanceTo(prev, at);
        prev = at;
        if (distanceTo(at, target) <= REACH_M) { reached = true; break; }
        await page.waitForTimeout(POLL_MS);
      }
    } finally {
      await page.keyboard.up('KeyW');
    }
    route[i].y = prev[1];   // the ground the feet stood on where the waypoint was reached
    // A leg nobody reached is photographed too: the picture of where the bot gave up is the most
    // useful one in the strip.
    legs.push({ i, walked, gap, shot: await shoot(i) });
    if (!reached) unreached = i;
  }
  console.log(unreached === null
    ? `tracks: every leg walked - ${route.length} waypoints, closing the browser`
    : `tracks: waypoint ${unreached} was never reached - closing the browser`);
} finally {
  // One exit for every path, including the throws above: a launched browser is closed and the
  // server is let go, so a failed author does not leave a port held.
  if (browser) await browser.close().catch((err) => console.warn(`tracks: could not close the browser: ${err?.message ?? err}`));
  await server.close();
}

// 5. THE JUDGEMENT, THEN THE WRITE. The table prints first: a run that failed still owes the
// reader what its walk did, waypoint by waypoint, with the picture of where each one ended.
const points = route.map((p) => [p.x, p.y, p.z]);
const verdict = validateTrack(points);   // the SAME validator the bot's legs will ask
const routeLength = trackLength(points);
const walkedTotal = legs.reduce((sum, leg) => sum + leg.walked, 0);

console.log('waypoint   walked m   screenshot');
for (const leg of legs) console.log(`  ${String(leg.i).padStart(3)}   ${leg.walked.toFixed(1).padStart(8)}   ${leg.shot}`);
console.log(`total      ${walkedTotal.toFixed(1).padStart(8)}   ${points.length} waypoints, ${routeLength.toFixed(1)} m of route`);

const problems = [];
if (!verdict.ok) problems.push(verdict.why);
if (routeLength < MIN_RUN_M) problems.push(`the route is ${routeLength.toFixed(1)} m, under the ${MIN_RUN_M} m a run needs`);
if (unreached !== null) {
  const leg = legs.find((l) => l.i === unreached);
  problems.push(`waypoint ${unreached} was never reached (${leg ? leg.walked.toFixed(1) : '?'} m walked of ${leg ? leg.gap.toFixed(1) : '?'} m) - `
    + 'a track the bot cannot walk is not a track');
}
if (errors.length) problems.push(`${errors.length} page error(s), the first being: ${errors[0]}`);

// THE ONE JUDGEMENT: a track written from a run that failed would turn this tool's own failure
// into a benchmark number, so nothing is written unless every leg was reached and the route the
// writer would emit is the route the bot's laws accept.
if (problems.length) throw new Error(`tracks: no track was written - ${problems.join('; ')}`);

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, tracksModuleText(points, { walked: walkedTotal, length: routeLength }));
console.log(`tracks: wrote ${OUT} - ${points.length} waypoints, ${routeLength.toFixed(1)} m of route`);
console.log(`tracks: ${walkedTotal.toFixed(1)} m walked; reject the route from the ${legs.length} shots in ${SHOTS}/`);
