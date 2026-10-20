// BENCH1'S CLI RUNNER (2026-10-19): the same unattended run the page's own card
// plays, driven from a terminal, written to files, and judged.
//
// WHAT IT DOES. Builds each page's ONE URL with the law's own `benchUrl`
// (src/systems/bench/law.js), opens it in Chromium, waits for the page's host to
// say it is over (`window.__bench.state` is 'done' or 'failed'), reads the report
// the host built, merges the world page's legs and the dungeon page's into one
// report in the law's run order, scores it with the law's own `scoreOf`, judges
// it, and writes `<out>.json` + `<out>.md` (and, with `--profile`, `<out>.cpuprofile`).
//
// HOW TO RUN IT. One command, and it launches the browser, the game and the run:
//   npm run bench                                 # every leg this machine can play, headed, your own browser
//   npm run bench -- --legs crowd,stream          # a subset, while the capital's route is unauthored
//   npm run bench -- --as-is --keep               # measure the player's own settings, leave the window up
//   npm run bench -- --headless --legs crowd      # a relative number for CI, on SwiftShader
// THE FIRST RUN ASKS FOR THE DATA FOLDER, in the game's own dialog, and the run WAITS for you to
// answer it (headless has nobody to, so there it refuses with the two ways past - `ARENA2_PATH`,
// or a headed run). Set `ARENA2_PATH` in the environment to skip the dialog entirely.
// Flags (each value flag is `--name value`; the switches take nothing):
//   --base <url>      the deployed site to measure (default: run a local vite server)
//   --port <n>        the local server's port                       (5237)
//   --legs <a,b>      street,crowd,blade,bow,spell,dungeon,stream, or all   (all)
//   --as-is           measure the player's own settings instead of the preset
//   --reps <n>        run the whole thing n times; the median is what is written  (1)
//   --out <basename>  the report's basename                        (benchmark-report)
//   --headed          a visible browser on the machine's own GPU (the default)
//   --headless        SwiftShader instead - a relative number, and it cannot answer the data dialog
//   --profile         profile the fight legs (blade, bow, spell) on the dungeon page
//   --boot <secs>     how long the game may take to boot and the run to appear - a person answering
//                     the folder dialog counts here                          (900)
//   --timeout <secs>  how long a page has to finish its whole run  (900)
//   --keep            leave the browser open at the end
//
// WHY EVERY CHOICE:
//
// IT IS OFFLINE. Nothing here dials out: no request of its own, no socket, no
// upload path at all. The only traffic is the browser loading the game from the
// server under test (the local vite server, or the `--base` a developer named),
// and the only thing that leaves the run is a file on this machine. That is
// honesty rule 8 of docs/Benchmark-Tool-Plan.md, and test/tooling/
// benchmarkcli.test.js sweeps this file for the code that would break it.
//
// IT REUSES THE INSTRUMENTS, IT DOES NOT GROW COPIES. The URL comes from
// `benchUrl` and the legs from `BENCH_LEGS`/`legsOf`; the report text from
// `reportLines` and the leg lines from `legRow`/`legHead` (the card's own table,
// so the file and the screen cannot disagree); the census verdict from `censusOk`
// (with the floor from the leg's own law); the score from `scoreOf`; and, with
// `--profile`, the CPU profile is read by `aggregate` from `./lib/cpuProfile.mjs`
// - THE profiler's own arithmetic, the function `npm run cpu` imports - not a
// second sampler and not a second aggregator. A benchmark with its own copy of
// any of these is a second game, and two runs that both say "street" stop being
// comparable the day the copies drift.
//
// IT JUDGES. A page that never reported, a non-empty failure list, a leg with no
// 1% low, a census under its floor, a profile with no samples: each is named, and
// the exit is non-zero. Printing "no measurement" and exiting 0 is the disease
// test/tooling/probehygiene.test.js T3 names, and there is no version of that
// here. The file paths are the last thing printed; the throw is the last thing
// this file does.
//
// THE PURE HALF IS EXPORTED. `parseArgs` (the flags), `mergeReports` (two pages
// into one report, the census judged) and `medianReport` (`--reps`) are pure, and
// the CLI body runs only when this file IS the program (tools/lib/isMain.mjs,
// AUDIT 68). Importing this module to test those three starts no server and opens
// no browser; vite and playwright are loaded inside `run()` for the same reason.
//
// WHY TWO PAGES AND NOT ONE. A dungeon is not a place the streamed world stands
// the player in from a URL (law.js says so), so the legs are played on the two
// hosts that can play them, and this file is what makes them one run: one score,
// one failure list, one file. The profile is the dungeon page's, because that is
// where the three fights are; with `--reps` it is the first repetition's, and the
// numbers written are the median of all of them.
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './lib/isMain.mjs';
import { BENCH_LEG_IDS, BENCH_LEGS, BENCH_PINS, BENCH_UNWIRED, benchUrl, censusOk, legsOf, parseLegs, scoreOf } from '../src/systems/bench/law.js';
import { DASH, legHead, legRow, reportLines } from '../src/ui/benchOverlay.js';
import { aggregate } from './lib/cpuProfile.mjs';
import { launchChromium } from './lib/browser.mjs';
import { BENCH_TRACKS } from '../src/systems/bench/tracks.js';   // BENCH1: whether a route exists yet - a leg whose route is not authored is not asked for   // BENCH1: the ladder that finds the browser this machine actually has


/** The repo root, which the local vite server serves and the law's URLs hang off. */
const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The two pages a run has, in the order they are opened: the streamed world's
 *  legs first (the street, the crowd), then the standalone dungeon host's (the
 *  three fights, the dungeon). The law says which legs belong to which. */
const SCENES = Object.freeze(['world', 'dungeon']);

/** The legs the profiler watches: the three fights, which are the dungeon page's.
 *  `benchUrl`'s dungeon page plays exactly these three plus the dungeon walk. */
const FIGHT_LEGS = Object.freeze(['blade', 'bow', 'spell']);

/** Microseconds between profiler samples - the profiler script's own default
 *  (`SAMPLING` in tools/cpuReport.mjs), so a profile taken here and one taken by
 *  `npm run cpu` are the same instrument at the same resolution. */
const PROFILE_INTERVAL = 250;

/** How often the profile poll asks the page which leg it is on. The legs are
 *  twenty seconds each; 150 ms is far finer than a leg boundary and costs a
 *  round trip 140 times a fight. */
const PROFILE_POLL_MS = 150;

/** Rows of `aggregate`'s table in the markdown: the top of the list, which is
 *  what a reader acts on (tools/cpuReport.mjs prints the same slice). */
const PROFILE_ROWS = 25;

/** The value flags, in the order the refusal names them. */
const FLAGS = Object.freeze(['--base', '--port', '--legs', '--reps', '--out', '--timeout', '--boot']);

/** The switches: on by their presence, and never given a value. */
const SWITCHES = Object.freeze(['--as-is', '--headed', '--headless', '--profile', '--keep']);

/** What each value flag wants, so a mistyped one is refused with the answer in
 *  the sentence rather than with a stack trace from deeper in. */
const VALUE_HELP = Object.freeze({
  '--base': 'the site to measure, e.g. https://daggerfalljs.dev (default: a local vite server)',
  '--port': 'the local server\'s port (5237)',
  '--legs': `${BENCH_LEG_IDS.join(',')}, or all`,
  '--reps': 'how many whole runs to take the median of (1)',
  '--out': 'the basename of the report files (benchmark-report)',
  '--timeout': 'seconds to wait for a page\'s run (900)',
  '--boot': 'seconds to wait for the game to boot and the run to appear (900) - a person answering the ARENA2 folder counts here, not against the run',
});

/** Every option's default, as one object, so `parseArgs` and its test cannot
 *  disagree about what a bare command line means. `legs` is a fresh copy of the
 *  law's run order per call - the law's array is frozen and shared. */
const DEFAULTS = Object.freeze({
  base: null,
  port: 5237,
  legs: BENCH_LEG_IDS,
  asIs: false,
  reps: 1,
  out: 'benchmark-report',
  headed: true,   // HEADED BY DEFAULT: the benchmark is a thing you WATCH play itself on your own GPU, and a headless run is a relative number the report has to label (--headless opts out)
  profile: false,
  timeout: 900,   // the RUN's own window: how long its legs may take once they start
  boot: 900,      // THE BOOT's window: a city with world-data packs takes a while to stand up, and a
                  // person answering the ARENA2 folder is not a slow benchmark
  keep: false,
});

/** A flag's number, refused rather than NaN'd: a port that parsed to NaN would
 *  open a server on some other port and a timeout of NaN would never wait. */
function whole(flag, value, least, most) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < least || n > most) {
    throw new Error(`benchmark: ${flag} wants a whole number from ${least} to ${most}, not "${value}" - ${VALUE_HELP[flag]}`);
  }
  return n;
}

/**
 * The command line as one options object. Every flag is spelled in `FLAGS` or
 * `SWITCHES` and nothing else is accepted: an unknown word is refused with the
 * list of the ones that exist, because `--heded` quietly measuring a headless
 * SwiftShader run and calling it the machine's own GPU is a lie about the number.
 * `--legs` is parsed by the law's own `parseLegs`, so the flag and the URL agree
 * on what a leg list is (unknown ids dropped, `all` every leg, run order kept);
 * a `--legs` that names no leg of this benchmark is refused rather than left to
 * `benchUrl`'s "no legs asked, so play them all" fallback, which would measure
 * the opposite of what was asked.
 * @param {string[]} argv the words after the script's name
 * @returns {{ base: string | null, port: number, legs: string[], asIs: boolean,
 *   reps: number, out: string, headed: boolean, profile: boolean, timeout: number, keep: boolean }}
 */
export function parseArgs(argv) {
  const opts = { ...DEFAULTS, legs: [...BENCH_LEG_IDS] };
  const words = Array.isArray(argv) ? argv.map((word) => String(word)) : [];
  for (let i = 0; i < words.length; i++) {
    const flag = words[i];
    if (SWITCHES.includes(flag)) {
      if (flag === '--as-is') opts.asIs = true;
      else if (flag === '--headed') opts.headed = true;
  else if (flag === '--headless') opts.headed = false;
      else if (flag === '--profile') opts.profile = true;
      else opts.keep = true;
      continue;
    }
    if (!FLAGS.includes(flag)) {
      throw new Error(`benchmark: unknown flag "${flag}" - one of ${[...FLAGS, ...SWITCHES].join(' ')}`);
    }
    const value = words[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`benchmark: ${flag} needs a value - ${VALUE_HELP[flag]}`);
    }
    i++;
    if (flag === '--base') opts.base = value.replace(/\/+$/, '');
    else if (flag === '--port') opts.port = whole(flag, value, 1, 65535);
    else if (flag === '--reps') opts.reps = whole(flag, value, 1, 100);
    else if (flag === '--timeout') opts.timeout = whole(flag, value, 1, 86400);
  else if (flag === '--boot') opts.boot = whole(flag, value, 1, 86400);
    else if (flag === '--out') {
      if (!value.trim()) throw new Error(`benchmark: --out needs a basename - ${VALUE_HELP[flag]}`);
      opts.out = value;
    } else {
      const legs = parseLegs(value);
      if (!legs.length) {
        throw new Error(`benchmark: --legs names no leg of this benchmark - one of ${BENCH_LEG_IDS.join(', ')}, or all`);
      }
      opts.legs = legs;
    }
  }
  // A PROFILE WITH NOTHING TO PROFILE IS REFUSED HERE, not twenty minutes later:
  // the sampler watches the three fights, so `--profile` beside a leg list without
  // one would spend a whole run then have to fail for having no samples.
  if (opts.profile && !FIGHT_LEGS.some((id) => opts.legs.includes(id))) {
    throw new Error(`benchmark: --profile needs one of the fight legs (${FIGHT_LEGS.join(', ')}) - --legs ${opts.legs.join(',')} has no fight to profile`);
  }
  return opts;
}

/**
 * THE TWO PAGES AS ONE RUN. Each page's legs are its own - the world's street,
 * crowd and stream and the dungeon's three fights and walk - and a run is the
 * two of them together, so this is the one place they meet: legs in the law's
 * run order (`BENCH_LEG_IDS`, not the order the pages happened to finish in), an
 * id the law does not have dropped as "no one's leg of this benchmark", and the
 * machine facts (gpu, size, build, preset, vital) taken from whichever page
 * reported them - both pages run on one machine, so a fact one page left null is
 * the other page's answer.
 *
 * A LEG'S CENSUS IS JUDGED HERE, with the law's own `censusOk` and the floor from
 * the leg's own definition in `BENCH_LEGS`: two runs whose crowds differ were not
 * the same scene, whatever the fps says, so a count under its floor becomes a
 * named failure carrying the law's sentence ("7 people, the leg promises 8").
 *
 * The failures are both pages' own (the report's `failures` and the page-level
 * ones the runner collected - a page error, a page that never reported), then the
 * census's, then `options.failures` (the CLI's own: a profile with no samples, a
 * leg the run never played). `score`, `grade` and `missing` come from `scoreOf`
 * over the merged legs, so a leg that reported no 1% low is named in `missing`
 * rather than averaged away.
 * @param {Array<{ scene?: string, report?: object | null, failures?: string[] }>} pages
 * @param {{ at?: string, failures?: string[] }} [options] the CLI's own run facts and failures
 * @returns {object} the report the page's card would print, with `scene: 'all'`
 */
export function mergeReports(pages, options = {}) {
  const list = Array.isArray(pages) ? pages : [];
  const failures = [];
  const played = new Map();
  const facts = {};
  for (const page of list) {
    if (!page) continue;
    const scene = typeof page.scene === 'string' ? page.scene : 'a';
    for (const said of Array.isArray(page.failures) ? page.failures : []) failures.push(String(said));
    const report = page.report;
    if (!report || typeof report !== 'object') {
      failures.push(`the ${scene} page reported no run`);
      continue;
    }
    for (const said of Array.isArray(report.failures) ? report.failures : []) failures.push(String(said));
    for (const key of ['at', 'gpu', 'size', 'build', 'preset', 'vital']) {
      if (facts[key] == null && report[key] != null) facts[key] = report[key];
    }
    for (const leg of Array.isArray(report.legs) ? report.legs : []) {
      if (!leg || typeof leg.id !== 'string' || !BENCH_LEG_IDS.includes(leg.id)) continue;
      // the first page that played a leg owns its numbers: two pages cannot play
      // the same leg, and if they ever did, one of them is a wiring fault, not a repeat
      if (!played.has(leg.id)) played.set(leg.id, leg);
    }
  }
  const legs = BENCH_LEG_IDS.filter((id) => played.has(id)).map((id) => played.get(id));
  for (const leg of legs) {
    const law = BENCH_LEGS.find((entry) => entry.id === leg.id);
    const verdict = censusOk(leg.census, law ? law.census : null);
    if (!verdict.ok) failures.push(`${law ? law.title : leg.id} (${leg.id}) is not its scene: ${verdict.why}`);
  }
  const scored = scoreOf(legs);
  for (const said of Array.isArray(options.failures) ? options.failures : []) failures.push(String(said));
  return {
    at: options.at ?? facts.at ?? new Date().toISOString(),
    scene: 'all',
    gpu: facts.gpu ?? null,
    size: facts.size ?? null,
    build: facts.build ?? null,
    preset: facts.preset ?? null,
    vital: facts.vital ?? null,
    legs,
    score: scored.score,
    grade: scored.grade,
    missing: scored.missing,
    failures,
  };
}

/** The numeric columns of a leg a repetition's median can mean. The other fields
 *  (title, kind, scene, census, notes) are facts about the leg, not measurements
 *  that vary between repetitions, and keep the first repetition's answer. */
const LEG_COLUMNS = Object.freeze([
  'seconds', 'frames', 'fps', 'meanMs', 'minMs', 'p50Ms', 'p95Ms', 'p99Ms', 'worstMs',
  'lowFps', 'scriptMs', 'scriptWorstMs', 'gpuMs', 'draws', 'binds',
]);

/** A number that is there, as the recorder writes one. A zero is a measurement,
 *  so it is kept; a null, a NaN and a string are not readings. */
const reading = (value) => typeof value === 'number' && Number.isFinite(value);

/** The median of the readings that are there, or null when there were none - a
 *  repetition cannot fill in a number another one measured as absent. */
function medianOf(values) {
  const kept = values.filter(reading);
  if (!kept.length) return null;
  const sorted = [...kept].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** max - min over the readings that are there, or null when fewer than two were
 *  there to differ: one run has no spread, and saying 0 would be a claim. */
function spreadOf(values) {
  const kept = values.filter(reading);
  return kept.length < 2 ? null : Math.max(...kept) - Math.min(...kept);
}

/**
 * `--reps`: THE MEDIAN OF WHOLE RUNS, WITH THE SPREAD BESIDE IT. The project's own
 * discipline is that a run's spread is a few tenths of a millisecond, so one run
 * is a coincidence and the median of several is the number; the written report is
 * built from per-leg per-column medians (not the single luckiest run), scored by
 * `scoreOf` over those medians so the headline is derived the same way every time.
 *
 * The non-numeric facts - census, notes, title - come from the repetition that
 * played that leg first, and the report's own header facts, failures and scene
 * come from the run whose SCORE is the median (or from the middle run by index
 * when the scores are not all numbers, which is what "the median run is what is
 * written" means when there is no number to rank).
 *
 * Each leg carries `spread: { column: max - min }` for the columns that had two
 * readings or more, and the report carries `reps` and `spread: { score }`. A leg
 * that only one repetition played keeps its numbers and an empty spread.
 * @param {Array<object>} reports the merged reports of each whole run
 * @returns {object | null} the report to write, or null when there was no run
 */
export function medianReport(reports) {
  const list = (Array.isArray(reports) ? reports : []).filter((report) => report && typeof report === 'object');
  if (!list.length) return null;
  if (list.length === 1) {
    return {
      ...list[0],
      legs: (Array.isArray(list[0].legs) ? list[0].legs : []).map((leg) => ({ ...leg, spread: {} })),
      reps: 1,
      spread: { score: null },
    };
  }
  const byScore = [...list].sort((a, b) => (reading(a.score) ? a.score : -Infinity) - (reading(b.score) ? b.score : -Infinity));
  const base = byScore[byScore.length >> 1];
  const legs = BENCH_LEG_IDS
    .filter((id) => list.some((report) => (report.legs ?? []).some((leg) => leg.id === id)))
    .map((id) => {
      const seen = list.map((report) => (report.legs ?? []).find((leg) => leg.id === id)).filter(Boolean);
      const leg = { ...seen[0] };
      const spread = {};
      for (const column of LEG_COLUMNS) {
        const values = seen.map((entry) => entry[column]);
        leg[column] = medianOf(values);
        const differed = spreadOf(values);
        if (differed !== null) spread[column] = differed;
      }
      leg.spread = spread;
      return leg;
    });
  const scored = scoreOf(legs);
  return {
    ...base,
    legs,
    score: scored.score,
    grade: scored.grade,
    missing: scored.missing,
    failures: [...new Set(list.flatMap((report) => (Array.isArray(report.failures) ? report.failures : [])))],
    reps: list.length,
    spread: { score: spreadOf(list.map((report) => report.score)) },
  };
}

/** Microseconds as the report's milliseconds. */
const ms = (us) => us / 1000;

/** One number at a fixed number of decimals, the report's own house spelling. */
const fixed = (value, digits = 1) => Number(value).toFixed(digits);

/** Where a sampled row lives. A built bundle keeps every function on line 1, so
 *  its COLUMN is the part that identifies it (`assets/main-ab12.js:1:20481` is a
 *  place you can find); a src/ row needs only its line. */
const frameAt = (row) => `${row.file}${row.line ? `:${row.line}` : ''}${row.col ? `:${row.col}` : ''}`;

/**
 * `--profile`'s tail for `<out>.md`: the top rows of `aggregate(profile)`'s
 * self-time list as the same table `npm run cpu` prints - self ms, share of the
 * active window, ms of one frame, the function, the place - so a benchmark's
 * markdown and the profiler's report read as one instrument. Idle is out of the
 * denominator and out of the table, as it is there: a page waiting on the GPU is
 * half asleep by the sampler's own count, and those percentages would double.
 * @param {ReturnType<typeof aggregate>} agg the profile read by the shared `aggregate`
 * @param {object} report the merged report, whose fight legs say how many frames the profile covered
 * @returns {string[]} the markdown lines, ready to join with a newline
 */
export function profileSection(agg, report) {
  const idleUs = agg.list.filter((row) => row.fn === '(idle)').reduce((sum, row) => sum + row.us, 0);
  const activeUs = Math.max(1, agg.totalUs - idleUs);
  const fights = (Array.isArray(report.legs) ? report.legs : []).filter((leg) => FIGHT_LEGS.includes(leg.id));
  const frames = fights.reduce((sum, leg) => sum + (reading(leg.frames) ? leg.frames : 0), 0);
  const rows = agg.list.filter((row) => row.fn !== '(idle)').slice(0, PROFILE_ROWS);
  return [
    '',
    '## Where the time went',
    '',
    `The fight legs (${fights.map((leg) => leg.id).join(', ') || 'none'}) profiled at ${PROFILE_INTERVAL} µs:`,
    `${agg.samples} samples over ${fixed(agg.wallSeconds)} s. Self time is a function's own body, not its`,
    'callees, and idle is out of the shares - the reading `npm run cpu` prints, from the same `aggregate`.',
    ...(frames
      ? [`\`ms/frame\` is that function's share of one of the ${Math.round(frames)} frames the fight legs measured.`]
      : ['`ms/frame` is empty: the fight legs reported no frame count.']),
    '',
    '| self ms | % | ms/frame | function | where |',
    '|---:|---:|---:|---|---|',
    ...rows.map((row) => `| ${fixed(ms(row.us))} | ${fixed((row.us / activeUs) * 100)} | `
      + `${frames ? fixed(ms(row.us) / frames, 2) : '-'} | \`${row.fn}\` | ${frameAt(row)} |`),
  ];
}

/** THE THROTTLE, REFUSED. Chromium slows a window that is occluded, backgrounded or has no user
 *  gesture: rAF drops to ~1 fps, timers stretch, and the GPU is idled. For a page that draws a
 *  game and a benchmark that measures it, that is not a nicety - it is a wrong answer, and it is
 *  the shape of the first real run this tool ever did (1 fps, a boot that never finished, a window
 *  behind the terminal). Every flag here is a documented Chromium switch for exactly that. */
const NO_THROTTLE = Object.freeze([
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--autoplay-policy=no-user-gesture-required',   // the game's music and its audio graph start without a click
  '--window-size=1280,720',
  '--start-maximized',   // the run fills the screen: it is a thing a person WATCHES
]);

/** The software GL a HEADLESS run draws with, so its numbers are labelled as such and never
 *  mistaken for a machine's (SwiftShader rasterises on the CPU). */
const SOFTWARE_GL = Object.freeze(['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']);

// the browser ---------------------------------------------------------------------------------
// THE MACHINE'S OWN BROWSER, NOT PLAYWRIGHT'S (the owner's ask, 2026-10-19: "use the default
// browser in the machine"). This tool first asked playwright for its own Chromium build, which a
// machine almost never has, and then told the person to install one they already owned - so the
// ladder now lives in tools/lib/browser.mjs: CHROME=, then the OS's default browser by its own
// registry answer, then playwright's bundled build, then the installed Chrome/Edge by channel,
// then its cache, then the well-known paths. Every rung is TRIED, and the one that won is printed
// with the run - the number belongs to that browser.
async function launchBrowser(chromium, options) {
  const { browser, label } = await launchChromium(chromium, options, {
    onTry: (label_, err) => console.log(`bench: ${label_} would not launch - ${String(err?.message ?? err).trim().split('\n')[0]}`),
  });
  console.log(`bench: browser - ${label}`);
  return browser;
}

/** THE PAGE CONTRACT, asked in the page's own words. The host owns the run and
 *  says when it is over; this file never guesses from the fps counter, because a
 *  page that is merely quiet is not a page that has finished. */
const SETTLED = () => {
  const bench = globalThis.__bench;
  return Boolean(bench) && (bench.state === 'done' || bench.state === 'failed');
};

/**
 * `--profile`: a CPU profile of THE FIGHTS, on the dungeon page's own CDP session.
 * The profiler starts when `window.__bench.leg` first names a fight leg and stops
 * when the last one ends (the leg changes to the dungeon walk, or the run is done),
 * polled on `leg` and `state` - a fixed timer would be a profile of whatever
 * happened to be on screen. Sampling is the profiler script's own 250 µs, so the
 * numbers read the same way.
 *
 * A run that never reached a fight leg, or a page that died mid-poll, answers
 * `{ profile: null }`: the caller turns that into a failure, because a profile of
 * nothing printed as an empty table reads as "the fights cost nothing".
 * @param {import('playwright').Page} page the dungeon page, already navigated
 * @param {number} timeoutMs how long the whole run may take
 * @returns {Promise<{ profile: object | null, settled: boolean }>}
 */
async function profileFights(page, timeoutMs) {
  const cdp = await page.context().newCDPSession(page);
  let profile = null;
  let started = false;
  let stopped = false;
  let settled = false;
  try {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: PROFILE_INTERVAL });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const seen = await page.evaluate(() => {
        const bench = globalThis.__bench;
        return bench ? { leg: bench.leg ?? null, state: bench.state ?? null } : null;
      }).catch(() => null);
      if (!seen) break;                       // the page is gone; nothing left to record
      const fighting = FIGHT_LEGS.includes(seen.leg);
      if (!started && fighting) {
        await cdp.send('Profiler.start');
        started = true;
      }
      if (started && !fighting) {
        profile = (await cdp.send('Profiler.stop')).profile ?? null;
        stopped = true;
        break;
      }
      if (seen.state === 'done' || seen.state === 'failed') {
        settled = true;
        break;
      }
      await page.waitForTimeout(PROFILE_POLL_MS);
    }
    if (started && !stopped) profile = (await cdp.send('Profiler.stop')).profile ?? null;
  } finally {
    await cdp.send('Profiler.disable').catch(() => {});
    await cdp.detach().catch(() => {});
  }
  return { profile, settled };
}

/**
 * ONE PAGE'S RUN: open its one URL, wait for the page's own verdict (the
 * `--timeout`, in milliseconds), read `window.__bench.report`, and collect what
 * went wrong - the page's `failures`, every `pageerror`, and a page that never
 * reported or ended without a report. Nothing here decides the exit code: the
 * caller merges and judges, so one page's failure is one named failure in one
 * report rather than two exit paths.
 * @param {import('playwright').Page} page a browser page to navigate
 * @param {{ scene: string, url: string }} planned the page and its law-built URL
 * @param {{ timeout: number }} opts the parsed flags
 * @param {boolean} wantProfile whether this visit takes the CPU profile
 * @returns {Promise<{ scene: string, url: string, state: string | null, report: object | null,
 *   failures: string[], profile: object | null }>}
 */
async function runScene(page, planned, opts, wantProfile) {
  const failures = [];
  const watch = (err) => failures.push(`${planned.scene}: ${String(err?.message ?? err)}`);
  // registered BEFORE the page is navigated: a page's load-time errors are the
  // most likely reason a run never finishes, and a listener added after `goto`
  // would miss exactly those (the profiler's own lesson).
  page.on('pageerror', watch);
  let state = null;
  let report = null;
  let profile = null;
  try {
    try {
      await page.goto(planned.url);
    } catch (err) {
      throw new Error(`benchmark: could not open ${planned.url} - ${String(err?.message ?? err).trim()}`);
    }
    // THE GAME'S ARENA2 GATE. Every door in this game asks for the data folder once (main.js awaits
    // `ensureArena2()` before bootWorld, so a `?bench=` page shows the same screen Play does). A
    // HEADLESS page has nobody to pick it, so the gate is a refusal with the two ways past it. A
    // HEADED page has the person who just typed the command - and the first cut threw there too,
    // closing the dialog out from under them: the whole point of a window is that they answer it.
    const gated = await page.waitForFunction(`(() => {
      if (globalThis.__bench) return 'bench';
      const gate = !!document.querySelector('input[type=file]');
      const said = /select your arena2 folder/i.test(document.body?.innerText ?? '');
      return gate || said ? 'gate' : null;
    })()`, null, { timeout: 20000 }).then((h) => h.jsonValue()).catch(() => null);
    if (gated === 'gate' && !opts.headed) {
      throw new Error(`benchmark: the ${planned.scene} page is asking for the ARENA2 folder, and a HEADLESS run has no hand to answer it. `
        + 'Rerun it headed (`npm run bench` opens a window where you pick the folder once and the browser remembers it), '
        + 'or point the dev server at your copy - `$env:ARENA2_PATH = "<your arena2 folder>"; npm run bench`.'
        + (opts.base ? ` This run was against ${opts.base}, which serves its own data.` : ''));
    }
    if (gated === 'gate') {
      console.log(`bench: the ${planned.scene} page is asking for the ARENA2 folder - PICK IT IN THE WINDOW (once; the browser remembers it)`);
    }
    // AND THE BOOT IS NOT THE RUN. A city with its world-data packs takes a while to stand up, and a
    // window that has not been answered yet is not a broken run: so the surface is waited for on its
    // own budget (`--boot`) before the run's own window (`--timeout`) starts.
    let up = gated === 'bench';
    if (!up) {
      up = await page.waitForFunction('!!globalThis.__bench', null, { timeout: opts.boot * 1000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!up) {
      failures.push(`the ${planned.scene} page never started the benchmark in ${opts.boot} s `
        + (gated === 'gate' ? '(the ARENA2 folder was still being asked for - was it picked in the window?)' : '(the game was still booting)')
        + ' - `--boot` raises the wait');
    }
    let settled = false;
    if (up && wantProfile) {
      const profiled = await profileFights(page, opts.timeout * 1000);
      profile = profiled.profile;
      settled = profiled.settled;             // the poll already waited out the run
    }
    if (up && !settled) {
      settled = await page.waitForFunction(SETTLED, null, { timeout: opts.timeout * 1000 })
        .then(() => true)
        .catch(() => false);
    }
    if (up && !settled) failures.push(`the ${planned.scene} page never reached a report in ${opts.timeout} s`);
    const read = await page.evaluate(() => {
      const bench = globalThis.__bench;
      if (!bench) return null;
      return {
        state: bench.state ?? null,
        report: bench.report ?? null,
        failures: Array.isArray(bench.failures) ? bench.failures.map(String) : [],
      };
    }).catch(() => null);
    if (!read) {
      failures.push(`the ${planned.scene} page lost window.__bench before its report could be read`);
    } else {
      state = read.state;
      report = read.report;
      for (const said of read.failures) failures.push(`${planned.scene}: ${said}`);
      if (state !== 'done' || !report) failures.push(`the ${planned.scene} page ended "${String(state)}" without a report`);
    }
  } finally {
    page.off('pageerror', watch);
  }
  return { scene: planned.scene, url: planned.url, state, report, failures, profile };
}

/**
 * THE FILES. `<out>.json` is the report itself, one object; `<out>.md` is the
 * card's own text - `reportLines(report).join('\n')`, whose failures section is
 * already the overlay's - plus, with a profile that has samples, where the time
 * went. `<out>.cpuprofile` is the raw payload for DevTools > Performance > Load.
 * A profile with no samples is deliberately not turned into a table: the report's
 * failures already say the profile collected nothing, and a table of dashes reads
 * as "the fights cost nothing".
 * @param {string} out the basename
 * @param {object} report the merged report
 * @param {{ profile: object | null, agg: object | null } | null} profiler the profile and its `aggregate`
 * @returns {string[]} the files written, in the order the console names them
 */
function writeReport(out, report, profiler) {
  const json = `${out}.json`;
  writeFileSync(json, `${JSON.stringify(report, null, 2)}\n`);
  const files = [json];
  const lines = reportLines(report);
  if (profiler?.agg && profiler.agg.samples > 0) lines.push(...profileSection(profiler.agg, report));
  const markdown = `${out}.md`;
  writeFileSync(markdown, `${lines.join('\n')}\n`);
  files.push(markdown);
  if (profiler?.profile) {
    const cpuprofile = `${out}.cpuprofile`;
    writeFileSync(cpuprofile, JSON.stringify(profiler.profile));
    files.push(cpuprofile);
  }
  return files;
}

/**
 * The whole run: the server (unless `--base`), the browser, one or more complete
 * repetitions of both pages, the median, the files, and the judgement.
 *
 * The console is the run's shape and nothing else: the two pages' URLs, the
 * card's own heading and one line per leg as it lands, the score, every failure,
 * and then the file paths - the last thing printed, because a reader of a failed
 * run should not have to scroll for the reason. Then this throws: a run that
 * reported no measurement is not a successful run.
 * @param {ReturnType<typeof parseArgs>} opts the parsed flags
 */
async function run(opts) {
  const startedAt = new Date().toISOString();
  const reports = [];
  const profiler = { profile: null, agg: null };
  const cliFailures = [];
  let server = null;
  let browser = null;
  let merged = null;
  try {
    // the browser and the dev server are imported HERE and not at the top of the
    // file: the pure half above is imported by test/tooling/benchmarkcli.test.js,
    // and a test of a flag table should not load vite or a browser to read it.
    const { createServer } = await import('vite');
    const { chromium } = await import('playwright');
    let base = opts.base;
    if (!base) {
      server = await createServer({
        root: ROOT,
        server: { port: opts.port, strictPort: true, hmr: false, watch: null },
        logLevel: 'silent',
      });
      await server.listen();
      base = `http://localhost:${opts.port}`;
    }
    // BOTH pages' URLs, from the one builder - and a page is skipped only when
    // none of `--legs` is that page's leg, which is the law's own answer (`legsOf`),
    // never a second list of which leg lives where.
    const plan = SCENES.map((scene) => ({
      scene,
      want: legsOf(scene).filter((leg) => opts.legs.includes(leg.id)).map((leg) => leg.id),
      url: benchUrl({ base, legs: opts.legs, asIs: opts.asIs, scene }),
    })).filter((page) => page.want.length);
    // A LEG THAT CANNOT BE PLAYED YET IS NOT ASKED FOR. The street run replays a route that
    // `npm run tracks` writes, and a fresh checkout has none - asking for it makes the first run red
    // for a reason one command fixes. It is dropped from the request with a line saying why; an
    // EXPLICIT `--legs street` still fails by name, because that is a promise the run breaks.
    // THE LEGS WHOSE DOOR IS NOT WIRED YET are dropped from the request with the law's own reason
    // (a route nobody authored, a journey this build cannot open), so a run asks for what it can play
    // and says what it left out. The law keeps the list and the sentence; the leg still fails by name
    // if a host is asked for it some other way.
    for (const [id, why] of Object.entries(BENCH_UNWIRED)) {
      if (!opts.legs.includes(id)) continue;
      if (id === 'street' && BENCH_TRACKS?.[BENCH_PINS.loc]) continue;   // its route IS authored: the leg is real
      console.log(`bench: the ${id} leg is not in this run - ${why}`);
      opts.legs = opts.legs.filter((x) => x !== id);
      for (const page of plan) {
        if (!page.want.includes(id)) continue;
        page.want = page.want.filter((x) => x !== id);
        page.url = benchUrl({ base, legs: page.want, asIs: opts.asIs, scene: page.scene });
      }
    }
    // a page with nothing left to play is not opened at all: its legs were named and dropped above
    for (let i = plan.length - 1; i >= 0; i--) if (!plan[i].want.length) plan.splice(i, 1);
    for (const page of plan) console.log(`bench: the ${page.scene} page - ${page.url}`);
    if (!plan.length) throw new Error('benchmark: no leg of this run can be played on this build yet - see the lines above for what each one is waiting on (`docs/Benchmark-Tool-Plan.md` has the order they are wired in)');
    browser = await launchBrowser(chromium, opts.headed
      ? { headless: false, args: NO_THROTTLE }
      : { headless: true, args: [...NO_THROTTLE, ...SOFTWARE_GL] });
    const page = await browser.newPage(opts.headed ? { viewport: null } : { viewport: { width: 1280, height: 720 } });   // headed: the window's own (maximised) size is the frame
    // THE WINDOW HAS TO BE THE ONE IN FRONT, OR NOTHING IS MEASURED. A Chromium window that opens
    // behind the terminal is an OCCLUDED window, and an occluded window's animation frames are
    // throttled to about 1 a second - so the run measured a 1 fps "game" that was really the
    // browser's own throttle, and its boot never finished. `bringToFront` is the other half of the
    // flags below: the throttle is refused by the flags, and the window is raised so the person
    // watching sees the run they asked for.
    if (opts.headed) await page.bringToFront().catch(() => {});
    console.log(legHead());
    for (let rep = 0; rep < opts.reps; rep++) {
      const pages = [];
      for (const planned of plan) {
        if (opts.reps > 1) console.log(`rep ${rep + 1}/${opts.reps} - the ${planned.scene} page`);
        // the profile belongs to the dungeon page, and to the FIRST repetition:
        // one instrument, one artefact, and the numbers written are the median anyway
        const result = await runScene(page, planned, opts, opts.profile && planned.scene === 'dungeon' && rep === 0);
        if (result.profile) {
          profiler.profile = result.profile;
          profiler.agg = aggregate(result.profile, PROFILE_INTERVAL);
        }
        for (const leg of Array.isArray(result.report?.legs) ? result.report.legs : []) console.log(legRow(leg));
        pages.push(result);
      }
      if (opts.profile && rep === 0 && (!profiler.agg || !profiler.agg.samples)) {
        cliFailures.push('the profile collected no samples - the fight legs were not running frames, so there is no "where the time went" to print');
      }
      reports.push(mergeReports(pages, { at: startedAt, failures: cliFailures }));
    }
    merged = medianReport(reports);
  } finally {
    // one exit for every path, including the throws above: the server and a
    // launched browser are closed here. `--keep` is the one exception - a person
    // asked to look at the card - and the wait for that window is below, before
    // the judgement, so the process ends when they close it.
    if (server) await server.close().catch((err) => console.warn(`bench: could not close the dev server: ${err?.message ?? err}`));
    if (browser && !opts.keep) await browser.close().catch((err) => console.warn(`bench: could not close the browser: ${err?.message ?? err}`));
  }
  // A leg that measured no 1% low is a failure of its own. `scoreOf` leaves it out
  // of the score (and names it in `missing`), and a run that quietly lost a leg
  // must not read as a run that played them all.
  if (!merged) throw new Error('benchmark: no run reached the merge - there is nothing to write and nothing to judge');
  for (const leg of merged.legs) {
    if (!reading(leg.lowFps) || leg.lowFps <= 0) {
      merged.failures.push(`${leg.title ?? leg.id} (${leg.id}) measured no 1% low - a leg with no frame rate is not a measurement`);
    }
  }
  // ...and a leg the run never played is missing by name, not by silence: this is
  // the one thing neither page can say, because the page only knows its own legs.
  const played = new Set([...merged.legs.map((leg) => leg.id), ...merged.missing]);
  for (const id of opts.legs) {
    if (!played.has(id)) merged.failures.push(`the run played no "${id}" leg - no page reported it`);
  }
  const files = writeReport(opts.out, merged, opts.profile ? profiler : null);
  if (reading(merged.score)) {
    console.log(`score ${Math.round(merged.score)}${merged.grade ? ` (${merged.grade})` : ''} - the harmonic mean of the legs' 1% lows, the rate of the worst frames a player feels`);
  } else {
    console.log(`score ${DASH} - nothing was measured, so there is nothing to score`);
  }
  for (const said of merged.failures) console.error(`FAILED  ${said}`);
  // the file paths are the last line, and `--keep`'s note rides on it rather than
  // standing after it: the failures must stay the first thing a reader finds.
  console.log(`bench: wrote ${files.join(', ')}${opts.keep ? ' - the browser stays open; close its window to end the run' : ''}`);
  if (opts.keep && browser && browser.isConnected()) {
    await new Promise((done) => { browser.once('disconnected', done); });
  }
  // THE JUDGEMENT. A page that never reported, a non-empty failure list, no leg
  // with a 1% low, a census under its floor: each is already a named failure
  // above, and the run is not a measurement. This is the last thing the file does.
  if (!merged.legs.some((leg) => reading(leg.lowFps) && leg.lowFps > 0)) {
    throw new Error('benchmark: this run is not a measurement - no leg measured a 1% low, so there is no frame rate to report');
  }
  if (merged.failures.length) {
    throw new Error(`benchmark: this run is not a measurement - ${merged.failures.join(' | ')}`);
  }
}

if (isMain(import.meta.url)) {
  try {
    await run(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(`benchmark: ${err?.message ?? err}`);
    process.exitCode = 1;
  }
}
