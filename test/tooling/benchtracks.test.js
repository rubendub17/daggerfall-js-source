// BENCH1 (2026-10-19) - THE TRACK AUTHOR AND ITS ONE OUTPUT, PINNED AS TEXT.
//
// tools/benchTracks.mjs cannot run in this checkout: it boots the pinned capital,
// and there is no ARENA2 here to boot. So this file pins the CONTRACT and never
// the runtime, and it does it by name rather than by hope:
//
//   - the shipped src/systems/bench/tracks.js is IMPORTED, because it is data and
//     nothing else; today it is an empty map, and an empty map must never read as a
//     finished route, so the emptiness is asserted out loud beside the reason its
//     own header gives.
//   - the author is READ, never imported - importing it would launch a browser and
//     boot a city - and the reading is of the things that make it an author at all:
//     it asks the one validator (systems/bench/track.js) instead of growing a second,
//     it drives the walk with the real keyboard and warps once, it carries class= in
//     the URL it navigates to (T2's own lesson about the chargen wizard swallowing
//     every key), and it judges its run and stops printing after that (T3).
//   - the shape it writes is the shape the shipped module parses: one frozen
//     [x, y, z] a waypoint, so a regeneration is a diff of numbers.
//
// WHY THIS IS WORTH A FILE: a route nobody walks is a benchmark of a bot standing in
// a wall. The frame numbers a run reports are the numbers of whatever the character
// was doing, so a track with no walk behind it, or a walk the bot never finished,
// is a measurement of nothing - and an empty tracks.js is only honest while the
// module and this file both say it is empty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BENCH_TRACKS } from '../../src/systems/bench/tracks.js';
import { validateTrack } from '../../src/systems/bench/track.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
/** The module the author owns and the game reads. */
const TRACKS = 'src/systems/bench/tracks.js';
/** The author itself. Read as text, never imported. */
const AUTHOR = 'tools/benchTracks.mjs';
/** The one line both files must spell the same way: the map the route hangs off. */
const SHAPE = 'export const BENCH_TRACKS = Object.freeze({';

test('BENCH1 tracks: the shipped BENCH_TRACKS is frozen and every track in it passes validateTrack - which today checks NOTHING, because the map is empty by design', () => {
  assert.ok(BENCH_TRACKS && typeof BENCH_TRACKS === 'object', 'the module exports the map');
  assert.equal(Object.isFrozen(BENCH_TRACKS), true, 'BENCH_TRACKS is frozen: a track is data a run reads, never a list a leg may append to');

  // Every track the module carries is asked the SAME question the bot's legs will ask it
  // (systems/bench/track.js validateTrack), and its waypoints are frozen too - a mutable
  // waypoint is a route a probe could quietly steer.
  const places = Object.keys(BENCH_TRACKS);
  for (const place of places) {
    const track = BENCH_TRACKS[place];
    assert.equal(Object.isFrozen(track), true, `${place}'s list of waypoints is frozen`);
    for (const point of track) {
      assert.equal(Object.isFrozen(point), true, `${place} carries a waypoint that is not frozen: ${JSON.stringify(point)}`);
      assert.ok(Array.isArray(point) && point.length === 3, `${place} carries a waypoint that is not an [x, y, z]: ${JSON.stringify(point)}`);
    }
    const verdict = validateTrack(track);
    assert.equal(verdict.ok, true, `${place}'s track is not one the bot can walk: ${verdict.why}`);
  }

  // TODAY THE LOOP ABOVE PROVES NOTHING, AND SAYING SO IS THE POINT. Asserting the map empty
  // is what stops "no track" from reading as "a track that passed": when tools/benchTracks.mjs
  // has been run on a machine with ARENA2, this deepEqual fails - and that failure is the
  // reminder to replace it with the count and length the author's own table promises, not a
  // reason to delete it.
  assert.deepEqual(places, [],
    `the shipped map is EMPTY (${places.length} places), so the validateTrack loop above is vacuous. `
    + 'When the capital has been authored, assert the places and their lengths here instead of deleting this line.');
});

test('BENCH1 tracks: the empty map\'s own header says what fills it, and that a place with no track is a leg that reports itself UNRUN', () => {
  const text = read(TRACKS);
  assert.match(text, /tools\/benchTracks\.mjs/, 'the header names the tool that writes this module - a reader must be able to regenerate it');
  assert.match(text, /UNRUN|unrun/, 'the header says a place with no track is a leg that must report itself unrun, never one a run may stand still through');
  assert.match(text, /EMPTY|empty/, 'the header says, in the file itself, that this map ships empty and why');
  assert.equal(/^\s*import\s/m.test(text), false,
    'tracks.js is data only - a track that imports is a program, and a program is a body the authoring tool should own');
  assert.equal(/JSON\.stringify/.test(text), false, 'the waypoints are a literal list, not a blob a reader has to parse');
});

test('BENCH1 tracks: the author imports the one validator and defines none of its own', () => {
  const src = read(AUTHOR);   // readFileSync, not an import: importing the author opens a browser and boots a city
  const imported = src.match(/import\s*\{([^}]*)\}\s*from\s*'\.\.\/src\/systems\/bench\/track\.js';/);
  assert.ok(imported, `${AUTHOR} imports ../src/systems/bench/track.js - the one validator, by its own path`);
  const names = imported[1].split(',').map((s) => s.trim()).filter(Boolean);
  for (const law of ['validateTrack', 'trackLength', 'distanceTo', 'bearingTo', 'REACH_M', 'MAX_SEGMENT_M', 'MIN_SEGMENT_M']) {
    assert.ok(names.includes(law), `the author imports ${law} from the track law rather than spelling a second copy of it`);
  }
  assert.match(src, /validateTrack\(/, 'it ASKS the validator before it walks and before it writes');
  // A second validator is how two files disagree about what a walkable track is, and only one
  // of them can be the one the bot's legs read.
  assert.equal(/(?:function|const|let|var)\s+(?:validateTrack|validTrack|isWalkable|isValidTrack|trackOk)\s*[=(]/.test(src), false,
    'the author defines a validator of its own - systems/bench/track.js validateTrack is the only one');
});

test('BENCH1 tracks: the walk is the real keyboard with ONE warp at waypoint 0, and a picture at every arrival', () => {
  const src = read(AUTHOR);
  assert.match(src, /page\.keyboard\.down\('KeyW'\)/, 'a leg holds W with the real keyboard, so the press travels the host\'s own held set, action registry and motor');
  assert.match(src, /page\.keyboard\.up\('KeyW'\)/, 'and every path out of a leg releases it - a held key with no hand on it is the disease');
  assert.match(src, /__player\.pos/, 'the walk judges itself by the feet the game reports, not by where it hoped the character went');
  assert.match(src, /REACH_M/, 'against the track law\'s own reach, so arrival means the same thing here as in a run');

  // ONE WARP, FOR WAYPOINT 0. A warp per waypoint would prove the doors' coordinates are finite
  // and nothing at all about the route: the collider, the steps, the crowd and the stream are
  // what a walk proves and a teleport skips.
  const warps = src.match(/__warpTo\(/g) ?? [];
  assert.equal(warps.length, 1, `the author calls __warpTo ${warps.length} time(s) - the walk gets one warp, for waypoint 0`);

  assert.match(src, /page\.screenshot\(/, 'each waypoint is photographed');
  assert.match(src, /bench-track-\$\{i\}\.png/, 'to tools/shots/bench-track-<i>.png - the strip a human rejects a route that walks through a wall by');
  assert.match(src, /console\.log\('waypoint/, 'and the report is a table of the walk: waypoint, metres walked, screenshot');
});

test('BENCH1 tracks: the URL the author navigates to carries class= and never bench= (T2)', () => {
  const src = read(AUTHOR);
  // The same reading of a probe's URL that test/tooling/probehygiene.test.js T2 makes: the
  // literal a page.goto is handed. A template literal is captured whole, which is what makes
  // `class=` visible to that gate too.
  const gotos = [...src.matchAll(/page\.goto\(\s*[`']([^`']*)[`']/g)].map((m) => m[1]);
  assert.equal(gotos.length, 1, `the author navigates one page, not ${gotos.length}`);
  const url = gotos[0];
  assert.match(url, /[?&]class=/, 'T2: without class= the chargen wizard mounts, holds the overlay slot and swallows every W this tool presses');
  for (const door of ['world', 'region=', 'loc=', 'tod=', 'weather=', 'wseed=', 'shot', 'play', 'fps']) {
    assert.ok(url.includes(door), `the URL the author boots carries "${door}" - the pinned place, the probe surface and the motor`);
  }
  assert.equal(/[?&]bench=/.test(url), false, 'the author does NOT run the benchmark: it walks a city, it measures nothing');
  assert.match(src, /BENCH_PINS/, 'and the pins are the law\'s own (systems/bench/law.js), not a second spelling of the capital');
});

test('BENCH1 tracks: the author judges its own run and stops printing after that (T3)', () => {
  // T3's own vocabulary, copied rather than imported (the gate is a test file: importing it
  // would register its tests a second time): a judgement is a refusal, and the tail after the
  // last one is a summary of one or two lines - a probe that prints ten states past its last
  // decision exercised its subject and checked none of it.
  const JUDGES = [
    /\b(die|fail|check)\s*\(/,
    /process\.exit\(\s*(?!0\s*\))/,
    /process\.exitCode\s*=\s*(?!0)/,
    /throw new \w*Error/,
    /\bassert[.(]/,
  ];
  const isHelperDef = (l) => /^\s*(const|function)\s+(die|fail|check)\b/.test(l);
  const judges = (l) => !isHelperDef(l) && JUDGES.some((re) => re.test(l));

  const lines = read(AUTHOR).split('\n');
  assert.ok(lines.some(judges), 'the author decides whether what it authored is a track at all - a probe that exits 0 whatever happens is the disease T3 names');
  let last = -1;
  lines.forEach((l, i) => { if (judges(l)) last = i; });
  const tail = lines.slice(last + 1).filter((l) => /console\.log\(/.test(l));
  assert.ok(tail.length <= 2,
    `${tail.length} states printed after the last judgement: the run stopped checking and kept talking - ${tail.map((l) => l.trim()).join(' | ')}`);

  const src = lines.join('\n');
  assert.match(src, /no track was written/, 'and the judgement is the WRITE\'s gate: a failed walk must not leave a route behind for a benchmark to replay');
  assert.match(src, /process\.exit|throw new/, 'the failure path is a non-zero exit, not a warning');
});

test('BENCH1 tracks: the writer emits the shipped shape - one frozen [x, y, z] a waypoint - into src/systems/bench/tracks.js by default', () => {
  const src = read(AUTHOR);
  const shipped = read(TRACKS).split('\n').find((l) => l.startsWith('export const BENCH_TRACKS'));
  assert.ok(shipped, 'the shipped module opens the map on a line of its own');
  assert.equal(shipped.trim(), `${SHAPE}});`, 'the shipped map is the opening line, closed - the byte the writer must match');
  assert.ok(src.includes(SHAPE), 'the author writes the same opening line the shipped file carries');
  assert.ok(src.includes('${BENCH_PINS.region}: Object.freeze(['), 'and the place it authored is the key of the frozen map');
  assert.ok(src.includes('Object.freeze([${'), 'one Object.freeze([x, y, z]) a waypoint, exactly as the shipped shape documents');
  assert.match(src, /points\.map\(/, 'the rows come from the walked points, in walk order');
  assert.equal(/JSON\.stringify/.test(src), false, 'the route is written a waypoint a line, not a serialised blob: a regeneration must be a diff of numbers');
  assert.match(src, /process\.env\.OUT \|\| 'src\/systems\/bench\/tracks\.js'/,
    'the default output IS the module the game reads - there is no second copy to fall out of date');
});

test('BENCH1 tracks: both spellings of every flag, and the route limits the plan sets', () => {
  const src = read(AUTHOR);
  // A flag reads the same in cmd and in PowerShell; the env spelling is kept for the tools
  // that have always used it (tools/perfProbe.mjs HEADED=1, tools/cpuReport.mjs PORT=).
  assert.match(src, /'--headed': \[/, '--headed, as in `npm run tracks -- --headed`');
  assert.match(src, /process\.env\.HEADED === '1'/, 'HEADED=1, the perfProbe spelling of the same thing');
  assert.match(src, /'--port': 'PORT'/, '--port <n>');
  assert.match(src, /process\.env\.PORT \|\| 5238/, 'PORT=<n>, on 5238 - not the dev server\'s 5173, and not perfProbe\'s 5237');
  assert.match(src, /'--out': 'OUT'/, '--out <path>');
  assert.match(src, /'--shots': 'SHOTS'/, '--shots <dir>');
  assert.match(src, /process\.env\.SHOTS \|\| 'tools\/shots'/, 'SHOTS=<dir>, defaulting to the gitignored tools/shots/');
  // The limits a track is authored under: 40 waypoints at most, 120 m of run at least - the
  // second one is the difference between a route and a station.
  assert.match(src, /const MAX_WAYPOINTS = 40;/);
  assert.match(src, /const MIN_RUN_M = 120;/);
});
