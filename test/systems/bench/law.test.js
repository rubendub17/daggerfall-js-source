// BENCH1'S LAW, PINNED (2026-10-19). The law module is data and arithmetic
// with no imports, so what it promises is readable here without booting
// anything. Two of these tests are not about behaviour at all: the URL must
// carry `class=` (a page without it mounts the chargen wizard, which swallows
// every key a run presses - test/tooling/probehygiene.test.js T2) and must
// never carry `online` (the benchmark is offline only). A run whose URL lost
// either one is not a slower number; it is a different scene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BENCH_LEG_IDS, BENCH_LEGS, BENCH_PINS, BENCH_PRESET, BENCH_VITAL,
  parseLegs, benchUrl, harmonicMean, scoreOf, gradeOf, censusOk, legsOf,
} from '../../../src/systems/bench/law.js';

/** A URL's query, decoded - the pins are checked the way the page reads them. */
const params = (url) => new URL(url, 'https://dfo.example').searchParams;

/** The world page's legs, in run order - what a world URL plays. */
const WORLD = legsOf('world').map((leg) => leg.id).join(',');
/** The dungeon page's legs. */
const DUNGEON = legsOf('dungeon').map((leg) => leg.id).join(',');

/** The census law's floor for a leg, by id. */
const floorOf = (id) => BENCH_LEGS.find((leg) => leg.id === id).census;

test('BENCH1 the leg list: seven legs in run order, frozen, and BENCH_LEGS is one object per id in the same order', () => {
  assert.deepEqual([...BENCH_LEG_IDS], ['street', 'crowd', 'blade', 'bow', 'spell', 'dungeon', 'stream']);
  assert.ok(Object.isFrozen(BENCH_LEG_IDS), 'the runner, the page and the result all read this one list');
  assert.deepEqual(BENCH_LEGS.map((leg) => leg.id), [...BENCH_LEG_IDS],
    'BENCH_LEGS covers exactly BENCH_LEG_IDS, in the same order');
  assert.ok(Object.isFrozen(BENCH_LEGS));
  assert.ok(BENCH_LEGS.every((leg) => Object.isFrozen(leg)), 'a leg cannot be edited into another leg');
  assert.deepEqual(BENCH_LEGS.map((leg) => leg.title),
    ['The street run', 'The crowd', 'A fight: the blade', 'A fight: the bow', 'A fight: a spell', 'The dungeon', 'The stream']);
});

test('BENCH1 every leg has a census key and a positive window: the frame legs 5 s warm and 20 s measured, the stream leg none warm and 60 s to settle', () => {
  for (const leg of BENCH_LEGS) {
    assert.ok(leg.census && typeof leg.census.key === 'string' && leg.census.key.length > 0, `${leg.id}: a census key`);
    assert.ok(Number.isFinite(leg.census.floor) && leg.census.floor > 0, `${leg.id}: a positive census floor`);
    assert.ok(Number.isFinite(leg.seconds) && leg.seconds > 0, `${leg.id}: a positive window`);
    assert.ok(Number.isFinite(leg.warmupSeconds) && leg.warmupSeconds >= 0, `${leg.id}: a warmup, maybe none`);
  }
  const frame = BENCH_LEGS.filter((leg) => leg.kind === 'frame');
  assert.deepEqual(frame.map((leg) => leg.id), ['street', 'crowd', 'blade', 'bow', 'spell', 'dungeon']);
  for (const leg of frame) assert.deepEqual([leg.warmupSeconds, leg.seconds], [5, 20], `${leg.id}: 5 s warm, 20 s measured`);
  const stream = BENCH_LEGS.find((leg) => leg.kind === 'stream');
  assert.deepEqual([stream.id, stream.warmupSeconds, stream.seconds], ['stream', 0, 60],
    'the stream leg is measured to the settle - 60 s is its ceiling, not its window');
  // the scene fact each leg's census proves: walkers, a ring of foes, and a streamed pixel
  assert.deepEqual([...BENCH_LEGS].map((leg) => [leg.id, leg.census.key, leg.census.floor]), [
    ['street', 'pixels', 1], ['crowd', 'pixels', 1], ['blade', 'foes', 3], ['bow', 'foes', 3],
    ['spell', 'foes', 3], ['dungeon', 'foes', 3], ['stream', 'pixels', 1],
  ]);
  assert.deepEqual(BENCH_LEGS.map((leg) => leg.kind), ['frame', 'frame', 'frame', 'frame', 'frame', 'frame', 'stream'],
    'only the map journey is a stream leg');
});

test('BENCH1 the pins and the preset: the same place, hour, weather, seed and class on every run, and the quality it forces named by six keys it records', () => {
  assert.deepEqual({ ...BENCH_PINS }, { region: 'Daggerfall', loc: 'Daggerfall', tod: '12:00', weather: 'sunny', wseed: 1, classId: 16 });
  assert.ok(Object.isFrozen(BENCH_PINS));
  assert.equal(new URL(`/play/?tod=${encodeURIComponent(BENCH_PINS.tod)}`, 'https://dfo.example').searchParams.get('tod'), '12:00',
    'the game parses tod back to noon - the spelling is parseTimeOfDay\'s, not the URL\'s');
  assert.deepEqual(Object.keys(BENCH_PRESET).sort(), ['crowd', 'grass', 'reflections', 'renderScale', 'shadows', 'trees'],
    'the preset invents no setting key beyond the six');
  assert.ok(Object.isFrozen(BENCH_PRESET), 'the host applies it and the result records it - neither may edit it');
  for (const [key, value] of Object.entries(BENCH_PRESET)) {
    assert.ok(typeof value === 'number' || typeof value === 'boolean', `${key}: a number or a boolean`);
  }
});

test('BENCH1 THE URL carries class= and the pins, fps and perf - and never online, which is the whole offline rule', () => {
  const url = benchUrl();
  assert.equal(url, `/play/?world&bench=${WORLD}&class=16&region=Daggerfall&loc=Daggerfall&tod=12%3A00&weather=sunny&wseed=1&shot&play&fps&perf`,
    'one spelling, one order: two runs of one scene must build the same URL');
  assert.equal(/[?&]class=/.test(url), true, 'a page without class= mounts the chargen wizard (probehygiene T2)');
  assert.equal(/[?&]fps\b/.test(url), true, 'the run reads the frame counter');
  assert.equal(/[?&]perf\b/.test(url), true, 'the run reads the perf meter');
  assert.equal(/[?&]online\b/.test(url), false, 'the benchmark is offline only - the relay is not part of the number');
  const q = params(url);
  assert.equal(q.has('world'), true, 'the streaming world, not a bare scene');
  assert.equal(q.get('bench'), WORLD, 'the world page plays the world\'s legs and only those');
  assert.equal(q.get('class'), '16');
  assert.equal(q.get('region'), 'Daggerfall');
  assert.equal(q.get('loc'), 'Daggerfall');
  assert.equal(q.get('tod'), '12:00', 'noon, decoded - the game\'s own parseTimeOfDay spelling');
  assert.equal(q.get('weather'), 'sunny');
  assert.equal(q.get('wseed'), '1');
  // the same two rules on every URL the law can build for this test file
  for (const legs of ['street', 'all', '', 'blade,fighting']) {
    for (const base of ['', 'https://dfo.example', 'https://dfo.example/online']) {
      for (const asIs of [false, true]) {
        const u = benchUrl({ base, legs, asIs });
        assert.equal(/[?&]class=/.test(u), true, `${base} ${legs} ${asIs}: class= is not optional`);
        assert.equal(/[?&]online\b/.test(u), false, `${base} ${legs} ${asIs}: online is never asked for`);
      }
    }
  }
});

test('BENCH1 asIs adds benchpreset=off: the run measures the player\'s own settings instead of forcing the preset', () => {
  assert.equal(benchUrl({ asIs: true }), `${benchUrl()}&benchpreset=off`);
  assert.equal(params(benchUrl({ asIs: true })).get('benchpreset'), 'off');
  assert.equal(params(benchUrl({ asIs: false })).has('benchpreset'), false, 'a forced run says nothing - the preset is the law\'s');
  assert.equal(params(benchUrl()).has('benchpreset'), false);
});

test('BENCH1 the base: trailing slashes trimmed, and an empty base yields the relative /play/... a page navigates to', () => {
  const tail = benchUrl().slice(benchUrl().indexOf('/play/'));
  assert.equal(benchUrl({ base: 'https://dfo.example' }), `https://dfo.example${tail}`);
  assert.equal(benchUrl({ base: 'https://dfo.example/' }), `https://dfo.example${tail}`, 'one trailing slash');
  assert.equal(benchUrl({ base: 'https://dfo.example///' }), `https://dfo.example${tail}`, 'all of them');
  assert.equal(benchUrl({ base: '' }), tail, 'a relative URL needs no origin');
  assert.equal(benchUrl({ base: '/' }), tail, 'a bare slash has no origin either');
  assert.equal(benchUrl({ base: 'https://dfo.example///' }).includes('example//'), false, 'no doubled slash');
});

test('BENCH1 the URL drops a leg the law does not have: a mistyped leg never reaches the page', () => {
  assert.equal(params(benchUrl({ legs: 'street,crowd,bladee' })).get('bench'), 'street,crowd');
  assert.equal(params(benchUrl({ legs: ' crowd , street ' })).get('bench'), 'street,crowd',
    'the law\'s run order, so one set of legs spells one URL');
  assert.equal(params(benchUrl({ legs: ['stream', 'crowd'] })).get('bench'), 'crowd,stream',
    'an array is a spelling too, and it comes back in the law\'s run order');
  // a leg of the OTHER page is not this page's and is dropped, not played
  assert.equal(params(benchUrl({ legs: 'blade,street', scene: 'world' })).get('bench'), 'street',
    'a fight is the dungeon page\'s leg - the world page drops it rather than opening a dungeon it cannot');
  assert.equal(params(benchUrl({ legs: 'blade,street', scene: 'dungeon' })).get('bench'), 'blade',
    'and the other way round');
});

test('BENCH1 the dungeon page: its own scene door, its own legs, and the same two hard rules', () => {
  const url = benchUrl({ scene: 'dungeon' });
  const q = params(url);
  assert.equal(q.has('dungeon'), true, 'the standalone dungeon host, which stands the player in a room');
  assert.equal(q.has('world'), false, 'not the streaming world');
  assert.equal(q.get('bench'), DUNGEON, 'the dungeon page plays the dungeon\'s legs and only those');
  assert.equal(q.get('class'), '16', 'the same character on both pages, or the two halves measure two games');
  assert.equal(q.has('shot'), true, 'the probe surface the legs read');
  assert.equal(q.has('play'), true, 'and the motor on - a shot boot with no play is a flying camera');
  assert.equal(q.has('region'), false, 'the dungeon host reads no region: a parameter it ignores is a lie about what was pinned');
  assert.equal(q.has('loc'), false);
  assert.equal(q.has('tod'), false);
  assert.equal(/[?&]class=/.test(url), true);
  assert.equal(/[?&]online\b/.test(url), false);
  assert.equal(benchUrl({ scene: 'dungeon', asIs: true }), `${url}&benchpreset=off`);
});

test('BENCH1 legsOf: each page plays its own half, and the two halves are the whole run', () => {
  assert.deepEqual(legsOf('world').map((leg) => leg.id), ['street', 'crowd', 'stream']);
  assert.deepEqual(legsOf('dungeon').map((leg) => leg.id), ['blade', 'bow', 'spell', 'dungeon']);
  assert.deepEqual([...legsOf('world'), ...legsOf('dungeon')].map((leg) => leg.id).sort(), [...BENCH_LEG_IDS].sort(),
    'every leg of the run is played by exactly one page');
  assert.deepEqual(legsOf('a tavern'), [], 'a scene the law does not have plays nothing');
});

test('BENCH1 the body a run wears: a pool, because /god would take the damage path out of the measurement', () => {
  assert.ok(Object.isFrozen(BENCH_VITAL));
  assert.ok(BENCH_VITAL.maxHealth >= 100000 && BENCH_VITAL.health === BENCH_VITAL.maxHealth,
    'the pool is the maximum, at full: a fight leg must not end with a corpse and must not begin wounded');
});

test('BENCH1 an empty leg list falls back to all: a run with no legs is not a run', () => {
  const all = WORLD;
  assert.equal(params(benchUrl({ legs: '' })).get('bench'), all, 'an empty spelling');
  assert.equal(params(benchUrl({ legs: [] })).get('bench'), all, 'an empty array');
  assert.equal(params(benchUrl({ legs: ',,  ,' })).get('bench'), all, 'commas and spaces are no legs');
  assert.equal(params(benchUrl({ legs: 'streets' })).get('bench'), all,
    'only unknown ids leaves nothing asked for - the law runs everything rather than a page with no subject');
  assert.equal(params(benchUrl({ legs: null })).get('bench'), all, 'not a string is no legs, and no legs is all');
});

test('BENCH1 parseLegs: trim, run order, all, dupes, unknown ids dropped, and anything but a string is no legs', () => {
  assert.deepEqual(parseLegs('street,blade'), ['street', 'blade']);
  assert.deepEqual(parseLegs(' street , blade '), ['street', 'blade'], 'tokens trimmed');
  assert.deepEqual(parseLegs('street,street,blade'), ['street', 'blade'], 'de-duped');
  assert.deepEqual(parseLegs('blade,street'), ['street', 'blade'], 'de-duped keeping run order');
  assert.deepEqual(parseLegs('street,,,  ,blade'), ['street', 'blade'], 'empties dropped');
  assert.deepEqual(parseLegs('street,fighting,blade'), ['street', 'blade'], 'an unknown id cannot reach the page');
  assert.deepEqual(parseLegs('streets'), [], 'nothing legal was asked for');
  assert.deepEqual(parseLegs('all'), [...BENCH_LEG_IDS], 'all is every leg, in run order');
  assert.deepEqual(parseLegs('all,street'), [...BENCH_LEG_IDS], 'all beside a leg is still all');
  assert.deepEqual(parseLegs(''), []);
  for (const junk of [null, undefined, 7, ['street'], { legs: 'street' }, () => 'street']) {
    assert.deepEqual(parseLegs(junk), [], `${String(junk)} is not a spelling`);
  }
});

test('BENCH1 harmonicMean: 60 and 30 average 40, not 45 - the worst leg is paid for; one value is itself; nothing to average is null', () => {
  assert.ok(Math.abs(harmonicMean([60, 30]) - 40) < 1e-9, `60 and 30 -> 40 (got ${harmonicMean([60, 30])})`);
  assert.ok(harmonicMean([60, 30]) < 45, 'a mean of rates is dragged down by the leg that stuttered');
  assert.equal(harmonicMean([42]), 42, 'one leg is its own mean');
  assert.equal(harmonicMean([]), null, 'a run that measured nothing has no score');
  assert.equal(harmonicMean([60, 0]), 60, 'a zero is dropped, not averaged in');
  assert.equal(harmonicMean([60, -30]), 60, 'and so is a negative');
  assert.equal(harmonicMean([60, NaN, Infinity, -Infinity]), 60, 'and anything not finite');
  assert.equal(harmonicMean([0, -1]), null, 'nothing measurable left');
  assert.equal(harmonicMean(null), null);
});

test('BENCH1 scoreOf: a leg with no number is REPORTED in missing, not averaged away; the kept ids stay in run order', () => {
  const run = scoreOf([
    { id: 'street', lowFps: 60 },
    { id: 'blade', lowFps: null },
    { id: 'bow', lowFps: 30 },
  ]);
  assert.deepEqual(run.legs, ['street', 'bow'], 'the legs that answered, in the law\'s run order');
  assert.deepEqual(run.missing, ['blade'], 'a lost leg must be VISIBLE');
  assert.ok(Math.abs(run.score - 40) < 1e-9, `two legs at 60 and 30 score 40 (got ${run.score})`);
  assert.equal(run.grade, 'B', '40 is the bottom of B');
  const reversed = scoreOf([{ id: 'bow', lowFps: 30 }, { id: 'street', lowFps: 60 }]);
  assert.deepEqual(reversed.legs, ['street', 'bow'], 'the caller\'s assembly order is not the run order');
  const unmeasured = scoreOf([{ id: 'street', lowFps: 0 }, { id: 'crowd', lowFps: NaN }]);
  assert.deepEqual(unmeasured, { score: null, grade: null, legs: [], missing: ['street', 'crowd'] });
  assert.deepEqual(scoreOf([]), { score: null, grade: null, legs: [], missing: [] }, 'an empty run scores nothing and owes nothing');
  assert.deepEqual(scoreOf(null), { score: null, grade: null, legs: [], missing: [] }, 'not a run at all');
  assert.deepEqual(scoreOf([{ id: 'streets', lowFps: 60 }]), { score: null, grade: null, legs: [], missing: [] },
    'an id the law never had is no one\'s missing leg');
  assert.deepEqual(scoreOf([{ id: 'street', lowFps: 60 }, { id: 'street', lowFps: null }]).legs, ['street'],
    'a repeated id keeps the number it was ever given');
});

test('BENCH1 gradeOf: the bands at every boundary - 89.9 is an A and 90 an S, 59.9 a B and 60 an A, 39.9 a C and 40 a B, 23.9 a D and 24 a C, 1 a D and below null', () => {
  assert.equal(gradeOf(90), 'S');
  assert.equal(gradeOf(1000), 'S');
  assert.equal(gradeOf(89.9), 'A');
  assert.equal(gradeOf(60), 'A');
  assert.equal(gradeOf(59.9), 'B');
  assert.equal(gradeOf(40), 'B');
  assert.equal(gradeOf(39.9), 'C');
  assert.equal(gradeOf(24), 'C');
  assert.equal(gradeOf(23.9), 'D');
  assert.equal(gradeOf(1), 'D');
  assert.equal(gradeOf(0.9), null, 'under a frame a second is no grade at all');
  assert.equal(gradeOf(0), null);
  assert.equal(gradeOf(-5), null);
  assert.equal(gradeOf(Infinity), null, 'not finite');
  assert.equal(gradeOf(NaN), null);
  assert.equal(gradeOf(null), null);
  assert.equal(gradeOf(undefined), null);
  assert.equal(gradeOf('60'), null, 'a string is not a frame rate');
});

test('BENCH1 censusOk: below the floor is not ok, at the floor is, above is - and a missing reading is never a pass', () => {
  // THE WORLD LEGS ARE CENSUSED BY THE TOWN BEING BUILT, NOT BY ITS CROWD. The first real run on a
  // machine found Daggerfall's population pool EMPTY (pool 0, max 96) with the street built and
  // drawing ~650 calls: the crowd is the game's fact to make, not the benchmark's to require, and
  // a leg that refuses to score a street the game itself left empty is measuring the population
  // system instead of the frame. The people count is still REPORTED beside it (the card shows it),
  // which is how that emptiness came to be seen at all.
  const pixels = floorOf('crowd');
  assert.deepEqual(pixels, { key: 'pixels', floor: 1 });
  const below = censusOk({ pixels: 0 }, pixels);
  assert.deepEqual(below, { ok: false, why: '0 pixels, the leg promises 1' }, 'the sentence names the count and the floor');
  assert.equal(censusOk({ pixels: 1 }, pixels).ok, true, 'the floor is a promise met');
  assert.match(censusOk({ pixels: 3 }, pixels).why, /3 pixels/);
  const missing = censusOk({}, pixels);
  assert.equal(missing.ok, false, 'no reading cannot be a pass - that is how two scenes get compared');
  assert.match(missing.why, /pixels/, 'and it says which fact was never read');
  assert.match(missing.why, /1/, 'and the floor it was promised');
  assert.equal(censusOk({ pixels: '1' }, pixels).ok, false, 'a string is no count');
  assert.equal(censusOk({ pixels: NaN }, pixels).ok, false);
  assert.equal(censusOk(null, pixels).ok, false);
  const foes = floorOf('blade');
  assert.deepEqual([foes.key, foes.floor], ['foes', 3]);
  assert.equal(censusOk({ foes: 3 }, foes).ok, true);
  assert.equal(censusOk({ foes: 2, pixels: 40 }, foes).ok, false, 'another leg\'s count cannot stand in for this one\'s');
});
