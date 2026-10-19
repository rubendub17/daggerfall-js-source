// BENCH1 (2026-10-19) - THE CLI RUNNER'S CONTRACT, PINNED WHERE IT CAN BE READ.
//
// `node tools/benchmark.mjs` cannot be run here: a run boots the real game and this
// checkout has no ARENA2 (and no dev server stood up for it). So this file holds the
// two things a test CAN hold - the pure half, for real, and the contract, as text:
//
//   * `parseArgs`, `mergeReports` and `medianReport` are imported and exercised. That
//     import is safe and deliberate: the tool's CLI body is guarded by the one
//     "am I the program" test (tools/lib/isMain.mjs), and vite and playwright are
//     loaded inside its `run()`, so importing it starts no server and opens no
//     browser. A test that could not read the flag table would have to guess it.
//   * The rest is `readFileSync`, NEVER an import of a running tool (tools/cpuReport.mjs
//     is the cautionary example: import it and it profiles whatever is on screen).
//     Those tests pin what a run is MADE of: the law's `benchUrl` builds every URL
//     (the tool spells no query of its own), the card's `reportLines` writes every
//     report (there is no second table), the profiler's `aggregate` reads the profile
//     (there is no second aggregator), nothing leaves the machine, and the run JUDGES
//     itself - test/tooling/probehygiene.test.js T3's rule, held on this file directly
//     rather than left to the sweep that also catches it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeReports, medianReport, parseArgs, profileSection } from '../../tools/benchmark.mjs';
import { BENCH_LEG_IDS, BENCH_LEGS } from '../../src/systems/bench/law.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOL = 'tools/benchmark.mjs';
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** The law's own definition of a leg, which is where its title and its census floor live. */
const lawLeg = (id) => BENCH_LEGS.find((leg) => leg.id === id);

/**
 * A leg as the page's recorder writes one: every column the card prints, a census
 * over the law's floor unless `census` says otherwise, and `lowFps` whatever the
 * caller says (null is the honest way to write "this leg measured nothing").
 */
const leg = (id, lowFps, census) => {
  const law = lawLeg(id);
  return {
    id,
    title: law.title,
    kind: law.kind,
    scene: law.scene,
    seconds: law.seconds,
    frames: lowFps ? Math.round(lowFps * 20) : 0,
    fps: lowFps,
    meanMs: lowFps ? 1000 / lowFps : null,
    minMs: lowFps ? 1 : null,
    p50Ms: lowFps ? 1000 / lowFps : null,
    p95Ms: lowFps ? 2000 / lowFps : null,
    p99Ms: lowFps ? 2500 / lowFps : null,
    worstMs: lowFps ? 4000 / lowFps : null,
    lowFps,
    scriptMs: lowFps ? 11 : null,
    scriptWorstMs: lowFps ? 30 : null,
    gpuMs: lowFps ? 21 : null,
    draws: lowFps ? 1200 : null,
    binds: lowFps ? 40 : null,
    census: census ?? { [law.census.key]: law.census.floor + 4 },
    notes: [],
  };
};

/** One page's `window.__bench.report`, in the host's shape, with `facts` overriding
 *  the machine facts so a test can say which page reported what. */
const pageReport = (scene, legs, facts = {}) => ({
  at: '2026-10-19T10:00:00.000Z',
  scene,
  gpu: null,
  size: null,
  build: null,
  preset: null,
  vital: null,
  legs,
  score: null,
  grade: null,
  missing: [],
  failures: [],
  ...facts,
});

/** The world page's facts: the ones the dungeon page does not report again. */
const WORLD_FACTS = {
  gpu: 'a test GPU',
  size: '1280x720',
  build: 'abc1234',
  preset: 'scale 1, shadows on',
  vital: '1000000 hp',
};

/** The dungeon page: same machine, and it leaves every machine fact null except the
 *  build - so a merge that drops the world page's answers is visible. */
const DUNGEON_FACTS = { at: '2026-10-19T10:01:00.000Z', build: 'abc1234' };

test('BENCH1 CLI: the two page URLs are the law benchUrl\'s, so the tool spells no query of its own', () => {
  const src = read(TOOL);
  const lawImport = src.match(/import \{([^}]*)\} from '\.\.\/src\/systems\/bench\/law\.js';/);
  assert.ok(lawImport, 'the tool imports the law - the legs, the URL and the score are not its to keep');
  const names = lawImport[1].split(',').map((name) => name.trim());
  for (const name of ['BENCH_LEG_IDS', 'BENCH_LEGS', 'benchUrl', 'censusOk', 'legsOf', 'parseLegs', 'scoreOf']) {
    assert.ok(names.includes(name), `the tool imports ${name} from the law rather than keeping a second copy of it`);
  }
  assert.match(src, /benchUrl\(\{ base, legs: opts\.legs, asIs: opts\.asIs, scene \}\)/,
    'each page URL is built by benchUrl, with the base the run actually stands on');
  assert.match(src, /legsOf\(/, 'a page is skipped when none of --legs is that page\'s leg, which is the law\'s answer');
  // A second spelling of the door is how two runs both called "street" measure two
  // streets: no query fragment of the URL may appear in this file at all.
  for (const literal of ['?world', '?dungeon', '/play/?', '&bench=', 'class=']) {
    assert.equal(src.includes(literal), false, `the tool spells "${literal}" itself - the one URL is benchUrl's`);
  }
});

test('BENCH1 CLI: the report text is the card\'s own - reportLines writes the file, and the tool has no second table', () => {
  const src = read(TOOL);
  const cardImport = src.match(/import \{([^}]*)\} from '\.\.\/src\/ui\/benchOverlay\.js';/);
  assert.ok(cardImport, 'the tool imports the card');
  const names = cardImport[1].split(',').map((name) => name.trim());
  for (const name of ['reportLines', 'legRow', 'legHead', 'DASH']) {
    assert.ok(names.includes(name), `the tool imports ${name} from src/ui/benchOverlay.js - one definition of the table`);
  }
  assert.equal(/function\s+(reportLines|legRow|legHead)\s*\(/.test(src), false,
    'the tool defines the card\'s table again - the file and the screen would drift apart');
  assert.equal(/COLS\s*=/.test(src), false, 'nor a second set of column widths');
  assert.equal(src.includes('| leg '), false, 'nor a markdown leg table of its own');
  assert.match(src, /reportLines\(report\)/, 'the markdown is reportLines\' own text, failures section and all');
  assert.match(src, /console\.log\(legRow\(leg\)\)/, 'the console prints the card\'s row as each leg lands');
});

test('BENCH1 CLI: --profile drives the profiler through the shared aggregate - no second sampler, no second aggregator', () => {
  const src = read(TOOL);
  assert.match(src, /import \{ aggregate \} from '\.\/lib\/cpuProfile\.mjs';/,
    'the profile is read by tools/lib/cpuProfile.mjs - the function `npm run cpu` imports');
  assert.equal(/function\s+aggregate\s*\(/.test(src), false, 'the tool grew its own aggregator');
  assert.match(src, /aggregate\(result\.profile, PROFILE_INTERVAL\)/,
    'the payload is read once, at the sampling interval the profiler was started with');
  assert.match(src, /const PROFILE_INTERVAL = 250;/);
  assert.match(src, /newCDPSession\(page\)/, 'the profile is taken on the page the fights run on');
  assert.match(src, /Profiler\.enable/);
  assert.match(src, /setSamplingInterval', \{ interval: PROFILE_INTERVAL \}/);
  assert.match(src, /Profiler\.start/, 'the sampler starts with the first fight leg');
  assert.match(src, /Profiler\.stop/, 'and stops when the last one ends');
  assert.match(src, /FIGHT_LEGS = Object\.freeze\(\['blade', 'bow', 'spell'\]\)/,
    'the legs the profiler watches are the three fights, named once');
  assert.match(src, /window\.__bench|globalThis\.__bench/, 'which leg is running is asked of the page contract');
});

test('BENCH1 CLI: --profile\'s markdown is the profiler\'s own table - self ms, share, ms/frame, the top 25 rows', () => {
  // A payload in `aggregate`'s own shape, worked out by hand: thirty rows from 10.00 ms
  // of self time down to 7.10, and an idle row whose 90 ms is neither in the table nor
  // in the shares - a page waiting on the GPU reads as half asleep, and counting idle
  // in the denominator would halve every percentage in the report.
  const rows = Array.from({ length: 30 }, (_, i) => ({ fn: `f${i}`, file: 'src/a.js', line: i + 1, game: true, us: 10000 - i * 100 }));
  const idle = { fn: '(idle)', file: '(idle)', line: 0, game: false, us: 90000 };
  const agg = { list: [idle, ...rows], totalUs: idle.us + rows.reduce((sum, row) => sum + row.us, 0), wallSeconds: 4, samples: 900 };
  const section = profileSection(agg, {
    legs: [
      { id: 'blade', frames: 100 },
      { id: 'bow', frames: 100 },
      { id: 'spell', frames: 100 },
      { id: 'dungeon', frames: 999 },   // not a fight leg, so not part of the profile's frame count
    ],
  });
  assert.ok(section.includes('## Where the time went'));
  const table = section.filter((line) => line.startsWith('|'));
  assert.equal(table.length, 2 + 25, 'the heading, the separator, then the top 25 rows (the profiler report\'s own slice)');
  assert.equal(table[0], '| self ms | % | ms/frame | function | where |');
  assert.equal(table[1], '|---:|---:|---:|---|---|');
  // f0: 10.00 ms of self time, 10000 of the 256500 active microseconds, over 300 frames
  assert.equal(table[2], '| 10.0 | 3.9 | 0.03 | `f0` | src/a.js:1 |');
  assert.equal(section.some((line) => line.includes('`f29`')), false, 'the slice is the top of the list, not the whole list');
  assert.equal(section.some((line) => line.includes('(idle)')), false, 'idle is out of the table and out of the shares');
  assert.ok(section.some((line) => line.includes('300 frames')), 'the fight legs\' own frame count is what ms/frame divides');

  // a profile with no frame count still reads: the column is a dash, never a zero
  const noFrames = profileSection(agg, { legs: [{ id: 'blade', frames: 0 }] });
  assert.match(noFrames.filter((line) => line.startsWith('|'))[2], /^\| 10\.0 \| 3\.9 \| - \|/);
});

// ── T3: THE PROBES THAT CANNOT FAIL ──────────────────────────────────────────
// test/tooling/probehygiene.test.js sweeps tools/*.mjs for exactly this, and this
// file is one of the tools it sweeps. The vocabulary is copied verbatim so the two
// gates cannot disagree about what a judgement is: a local die/fail/check call, an
// exit that is not a literal 0, a throw, an assert.
const JUDGES = [
  /\b(die|fail|check)\s*\(/,
  /process\.exit\(\s*(?!0\s*\))/,
  /process\.exitCode\s*=\s*(?!0)/,
  /\bthrow new \w*Error/,
  /\bassert[.(]/,
];
const isHelperDef = (line) => /^\s*(const|function)\s+(die|fail|check)\b/.test(line);
const judges = (line) => !isHelperDef(line) && JUDGES.some((re) => re.test(line));

test('BENCH1 CLI: T3 - the runner judges its run, and the file paths are the last thing it prints', () => {
  const lines = read(TOOL).split('\n');
  let last = -1;
  lines.forEach((line, i) => { if (judges(line)) last = i; });
  assert.ok(last >= 0, 'the tool never decides whether its run worked - its exit code is 0 whatever happens');
  const after = lines.slice(last + 1).filter((line) => /console\.log\(/.test(line));
  assert.deepEqual(after, [], 'the tool keeps printing past its last judgement - that tail is unchecked');
  const src = lines.join('\n');
  // The four conditions the runner must refuse a run on, each present as text: a
  // page that never reported (mergeReports names it), a non-empty failure list, no
  // leg with a 1% low, and a census under its floor (censusOk's verdict).
  assert.match(src, /this run is not a measurement/);
  assert.match(src, /no leg measured a 1% low/);
  assert.match(src, /if \(merged\.failures\.length\)/);
  assert.match(src, /censusOk\(leg\.census, law \? law\.census : null\)/,
    'the census is judged in the CLI as well, with the law\'s floor');
});

test('BENCH1 CLI: nothing leaves the machine - no request, no socket, no upload path', () => {
  const src = read(TOOL);
  for (const banned of [/\bfetch\s*\(/, /new WebSocket/, /XMLHttpRequest/, /sendBeacon/, /\.upload\b/]) {
    assert.equal(banned.test(src), false,
      `the tool grew ${banned} - the benchmark is offline and the report is a file on this machine, never a post`);
  }
  assert.match(src, /writeFileSync\(/, 'the report is written, not sent');
});

test('BENCH1 CLI: the flags - documented defaults, values and switches, and an unknown flag refused by name', () => {
  const bare = parseArgs([]);
  assert.deepEqual(bare.legs, [...BENCH_LEG_IDS], 'no --legs is every leg, in the law\'s run order');
  assert.equal(bare.base, null, 'no --base is the local vite server, not a deployed site');
  assert.equal(bare.port, 5237);
  assert.equal(bare.asIs, false);
  assert.equal(bare.reps, 1);
  assert.equal(bare.out, 'benchmark-report');
  assert.equal(bare.headed, true, 'HEADED BY DEFAULT: the benchmark is a thing you watch play itself on your own GPU (--headless opts out)');
  assert.equal(parseArgs(['--headless']).headed, false, 'and the opt-out is a flag of its own');
  assert.equal(bare.profile, false);
  assert.equal(bare.timeout, 900);
  assert.equal(bare.keep, false);

  const all = parseArgs([
    '--base', 'https://daggerfalljs.dev/', '--port', '5300', '--legs', 'blade,street',
    '--as-is', '--reps', '3', '--out', 'run-a', '--headed', '--profile', '--timeout', '60', '--keep',
  ]);
  assert.equal(all.base, 'https://daggerfalljs.dev', 'a trailing slash is trimmed - the law joins with its own');
  assert.equal(all.port, 5300);
  assert.deepEqual(all.legs, ['street', 'blade'], 'the law\'s run order, not the order they were typed in');
  assert.equal(all.asIs, true);
  assert.equal(all.reps, 3);
  assert.equal(all.out, 'run-a');
  assert.equal(all.headed, true);
  assert.equal(all.profile, true);
  assert.equal(all.timeout, 60);
  assert.equal(all.keep, true);
  assert.deepEqual(parseArgs(['--legs', 'all']).legs, [...BENCH_LEG_IDS], 'all is every leg, through the law\'s own parser');

  assert.throws(() => parseArgs(['--heded']), /unknown flag "--heded"/);
  assert.throws(() => parseArgs(['--heded']), /--profile/, 'the refusal names the flags that exist');
  assert.throws(() => parseArgs(['--port']), /--port needs a value/);
  assert.throws(() => parseArgs(['--port', 'seventy']), /whole number/);
  assert.throws(() => parseArgs(['--legs', 'flying']), /names no leg/);
  assert.throws(() => parseArgs(['--profile', '--legs', 'street']), /fight legs/,
    'a profile with no fight to profile is refused before the run, not after it');

  // A parsed default is a fresh copy of the law's frozen list: one caller mutating
  // its own options must not poison the next parse.
  all.legs.push('crowd');
  assert.deepEqual(parseArgs([]).legs, [...BENCH_LEG_IDS]);
});

test('BENCH1 CLI: the two pages become one run in the law\'s order, with the machine facts from whichever page reported them', () => {
  const merged = mergeReports([
    { scene: 'world', report: pageReport('world', [leg('street', 58), leg('crowd', 41), leg('stream', 30)], WORLD_FACTS) },
    { scene: 'dungeon', report: pageReport('dungeon', [leg('blade', 50), leg('dungeon', 33)], DUNGEON_FACTS) },
  ]);
  assert.deepEqual(merged.legs.map((entry) => entry.id), ['street', 'crowd', 'blade', 'dungeon', 'stream'],
    'BENCH_LEG_IDS run order, not the order the two pages finished in');
  assert.equal(merged.scene, 'all');
  assert.equal(merged.gpu, 'a test GPU', 'the dungeon page left gpu null, so the world page\'s answer stands');
  assert.equal(merged.size, '1280x720');
  assert.equal(merged.preset, 'scale 1, shadows on');
  assert.equal(merged.vital, '1000000 hp');
  assert.equal(merged.build, 'abc1234');
  assert.equal(merged.at, '2026-10-19T10:00:00.000Z', 'the first page that reported a timestamp');
  assert.deepEqual(merged.missing, []);
  // the law's harmonic mean of the five 1% lows, worked out here by hand
  assert.equal(merged.score, 5 / (1 / 58 + 1 / 41 + 1 / 50 + 1 / 33 + 1 / 30));
  assert.equal(merged.grade, 'C');
  assert.deepEqual(merged.failures, [], 'a run whose legs all measured their scene has nothing to fail');
});

test('BENCH1 CLI: a leg that measured nothing is missing by name, and a census under its floor is a failure in the law\'s own words', () => {
  const merged = mergeReports([
    {
      scene: 'world',
      // a pageerror the runner collected, and the page's own failure list
      failures: ['world: TypeError: a townsman lost his flat'],
      report: {
        ...pageReport('world', [leg('street', null), leg('crowd', 41, { pixels: 0, people: 5 }), leg('stream', 30)], WORLD_FACTS),
        failures: ['the crowd leg lost three townsfolk'],
      },
    },
    { scene: 'dungeon', report: null, failures: ['dungeon: never reached a report'] },
  ]);
  assert.deepEqual(merged.missing, ['street'], 'scoreOf names the leg rather than averaging it away');
  // the census verdict is the law's OWN sentence, about the law's own leg
  assert.ok(
    merged.failures.some((said) => said.includes(BENCH_LEGS.find((entry) => entry.id === 'crowd').title)
      && said.includes('0 pixels, the leg promises 1')),   // the law's census: the town built, with the crowd reported beside it
    `a crowd of 5 against a floor of 8 must be named in the law's words, got: ${JSON.stringify(merged.failures)}`,
  );
  for (const said of [
    'the crowd leg lost three townsfolk',
    'world: TypeError: a townsman lost his flat',
    'dungeon: never reached a report',
    'the dungeon page reported no run',
  ]) {
    assert.ok(merged.failures.includes(said), `the failure "${said}" was dropped in the merge`);
  }
  assert.equal(merged.score, 2 / (1 / 41 + 1 / 30), 'the score is of the legs that measured, and `missing` says what was not');
});

test('BENCH1 CLI: a leg id the law does not have is no one\'s leg - it is neither merged nor "missing"', () => {
  const merged = mergeReports([{
    scene: 'world',
    report: pageReport('world', [leg('street', 50), { id: 'flying', title: 'A flight', lowFps: 200, census: {} }], WORLD_FACTS),
  }]);
  assert.deepEqual(merged.legs.map((entry) => entry.id), ['street'], 'not a leg of this benchmark, so not a row');
  assert.deepEqual(merged.missing, [], 'and not an absence either - nothing promised it');
  assert.equal(merged.score, 50);
});

test('BENCH1 CLI: --reps writes the median of the whole runs and records the spread beside it', () => {
  const run = (lowFps, failures = []) => mergeReports([
    { scene: 'world', report: pageReport('world', [leg('street', lowFps), leg('crowd', 40)], WORLD_FACTS) },
    { scene: 'dungeon', report: pageReport('dungeon', [leg('blade', 50), leg('dungeon', 30)], DUNGEON_FACTS) },
  ], { at: '2026-10-19T10:00:00.000Z', failures });

  const runs = [run(50), run(60, ['the profile collected no samples']), run(70)];
  const median = medianReport(runs);
  assert.equal(median.reps, 3);
  assert.deepEqual(median.legs.map((entry) => entry.id), ['street', 'crowd', 'blade', 'dungeon'], 'the law\'s order survives the median');
  const street = median.legs.find((entry) => entry.id === 'street');
  assert.equal(street.lowFps, 60, 'the middle of 50, 60 and 70 - the median run, not the luckiest one');
  assert.equal(street.spread.lowFps, 20, 'max - min, beside the number it belongs to');
  assert.equal(street.spread.fps, 20);
  assert.ok(street.spread.meanMs > 0, 'every column that varied carries its spread');
  const crowd = median.legs.find((entry) => entry.id === 'crowd');
  assert.equal(crowd.spread.lowFps, 0, 'three runs that agreed: a spread of zero, which is a reading, not a missing one');
  // the headline is scored from the medians, not from one run's score
  assert.equal(median.score, 4 / (1 / 60 + 1 / 40 + 1 / 50 + 1 / 30));
  assert.equal(median.grade, 'B', '42 fps of 1% lows is the law\'s B band');
  assert.equal(median.spread.score, Math.max(...runs.map((entry) => entry.score)) - Math.min(...runs.map((entry) => entry.score)),
    'the score carries its own spread');
  assert.ok(median.failures.includes('the profile collected no samples'),
    'a failure in ANY repetition fails the run - the union survives the median');

  // two runs: the median is the mean of the two middles, and the spread is still max - min
  const pair = medianReport([run(50), run(70)]);
  assert.equal(pair.reps, 2);
  assert.equal(pair.legs.find((entry) => entry.id === 'street').lowFps, 60);
  assert.equal(pair.legs.find((entry) => entry.id === 'street').spread.lowFps, 20);

  // one run is no spread at all, and says so rather than claiming zero
  const single = medianReport([run(50)]);
  assert.equal(single.reps, 1);
  assert.equal(single.legs.find((entry) => entry.id === 'street').lowFps, 50);
  assert.deepEqual(single.legs[0].spread, {});
  assert.equal(single.spread.score, null);
  assert.equal(medianReport([]), null, 'no run is no report');
});
