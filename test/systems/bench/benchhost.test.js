import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createBenchHost, SWING_MS, SWING_EVERY_MS } from '../../../src/scenes/benchHost.js';
import { BENCH_VITAL } from '../../../src/systems/bench/law.js';

// BENCH1's host: the leg machine. It cannot be booted here (there is no ARENA2 in this checkout),
// but it does not need the game to be DRIVEN - every question it asks the game is a dep, so the
// state machine, the judgements and the report can be walked end to end on fake ones. That is the
// point of the deps: the game answers, the host decides.
//
// What is pinned here is the honesty, not the plumbing: a leg that measured nothing is a named
// failure, a census that came up short says so in the law's own words, a stream that never settles
// fails by name, the run's body is the pool the law names, and every leg's frames are the gaps
// between the frame stamps the host was handed.

const FRAME_MS = 1000 / 60;

/** A fake world: the character stands still, faces +z, has 12 townsfolk about, and the stream is
 *  idle as soon as the test says so. Every dep is a spy, so a test can prove the host ASKED. */
function fakeWorld(over = {}) {
  const asked = { press: [], release: [], turn: [], travel: 0, prepared: [] };
  const deps = {
    scene: 'world',
    params: new URLSearchParams('bench=crowd'),
    feet: () => [0, 0, 0],
    heading: () => 0,
    turnBy: (r) => asked.turn.push(r),
    press: (c) => asked.press.push(c),
    release: (c) => asked.release.push(c),
    codes: () => ({ forward: 'KeyW', run: 'KeyR', swing: 'Mouse1' }),
    entity: () => body,
    renderer: () => ({ frameInfo: () => ({ gpu: 'fake GPU', world: [1280, 720], canvas: [1280, 720], dpr: 1, scale: 1 }) }),
    settle: () => true,   // the fake town is already streamed; a leg waits for this before it warms
    census: (key) => (key === 'people' ? 12 : key === 'pixels' ? 1 : null),
    prepareLeg: (id) => asked.prepared.push(id),
    travel: () => { asked.travel++; return true; },
    build: () => 'Update 42',
    document: null,
    now: () => clock,
    ...over,
  };
  const body = { health: 50, maxHealth: 100, chargenDone: true };   // a minted character: the run refuses to measure over a wizard
  let clock = 1000;
  const host = createBenchHost(deps);
  /** Step the frame loop for `seconds`, giving the host the stamps a rAF would. */
  const play = (seconds) => {
    const steps = Math.round((seconds * 1000) / FRAME_MS);
    for (let i = 0; i < steps; i++) { clock += FRAME_MS; host.tick(FRAME_MS / 1000, clock); }
    return host.surface;
  };
  return { host, body, play, asked, deps, clock: () => clock };
}

test('BENCH1 host: a clean leg runs its warmup, measures its frames and reports the tail the recorder gives', () => {
  const w = fakeWorld({ params: new URLSearchParams('bench=crowd') });
  w.play(5 + 20 + 1);   // warmup, the measured window, and a frame past it
  const s = w.host.surface;
  assert.equal(s.state, 'done', `state ${s.state}, failures ${JSON.stringify(s.failures)}`);
  const [leg] = s.report.legs;
  assert.equal(leg.id, 'crowd');
  assert.ok(leg.frames > 1100 && leg.frames < 1300, `${leg.frames} frames in a 20 s window at 60 fps`);
  assert.ok(Math.abs(leg.fps - 60) <= 1, `fps ${leg.fps}`);
  assert.ok(Math.abs(leg.p99Ms - FRAME_MS) < 0.01, 'a steady leg: p99 is the frame');
  assert.ok(Math.abs(leg.lowFps - 60) <= 1, `the 1% low of a steady leg ${leg.lowFps}`);
  assert.ok(Math.abs(s.report.score - leg.lowFps) < 1e-9,
    `one leg scored: its own 1% low, to the float - ${s.report.score} vs ${leg.lowFps}`);
  assert.equal(s.report.grade, 'A', `60 fps bands as A, got ${s.report.grade}`);
  assert.deepEqual(s.report.missing, [], 'every leg offered was measured');
  assert.deepEqual(s.report.failures, []);
  assert.equal(s.report.vital, `health pool ${BENCH_VITAL.health} of ${BENCH_VITAL.maxHealth}`, 'the run says what body it wore');
  assert.equal(s.report.preset, null, 'this host wired no setting door, so no preset was forced - and the report says so by saying nothing');
  assert.match(s.text(), /preset: the player's own settings/, 'which the card prints as the settings it actually measured');
});

test('BENCH1 host: the body is the pool before the first leg - and it is the only write', () => {
  const w = fakeWorld();
  assert.equal(w.body.health, 50, 'untouched before the run begins');
  w.play(1);
  assert.equal(w.body.maxHealth, BENCH_VITAL.maxHealth);
  assert.equal(w.body.health, BENCH_VITAL.health, 'the pool, at full, at the start of the run');
});

test('BENCH1 host: a leg waits for the stream, so it never measures a loading screen as the town', () => {
  // the town arrives over the first seconds: pixels, flats, people, lights. A leg that measured
  // inside that window reports the loader's frame rate as the capital's - the one lie this
  // instrument exists to prevent. The stream leg is the exception, and keeps its own test.
  let idle = false;
  const w = fakeWorld({ params: new URLSearchParams('bench=crowd'), settle: () => idle });
  w.play(10);                       // ten seconds of a town still streaming
  assert.equal(w.host.surface.state, 'running', 'nothing was measured while the stream was busy');
  idle = true;                     // the stream drains
  w.play(5 + 20 + 1);              // its warmup, its window, and a frame past it
  const [leg] = w.host.surface.report.legs;
  assert.equal(w.host.surface.state, 'done', JSON.stringify(w.host.surface.failures));
  assert.ok(Math.abs(leg.seconds - 20) < 0.1, `the measured window is the leg's 20 s, not the wait - ${leg.seconds}`);
  assert.ok(leg.frames > 1100 && leg.frames < 1300, `${leg.frames} frames: the window, and none of the ten seconds before it`);
});

test('BENCH1 host: a scene that is not the scene is a FAILURE in the law\'s own words, not a slow leg', () => {
  // the REQUIRED fact is the town being built; a leg whose host cannot even say that is a failure
  const w = fakeWorld({ census: (key) => (key === 'pixels' ? 0 : 12), params: new URLSearchParams('bench=crowd') });
  w.play(5 + 20 + 1);
  const s = w.host.surface;
  assert.equal(s.state, 'failed', 'a short census fails the run even though every frame was counted');
  assert.deepEqual(s.report.failures, ['The crowd: 0 pixels, the leg promises 1']);
  assert.equal(s.report.legs[0].frames > 1100, true, 'the leg was still measured - the failure is the scene, not the frames');
});

test('BENCH1 host: the crowd is REPORTED beside the scene, so a town the game left empty is visible and not fatal', () => {
  // the first real run on a machine: Daggerfall built, drawing ~650 calls, and its population pool
  // EMPTY. The leg scores on the street being there and prints the crowd - 0 - so the emptiness is
  // a reading a reader can act on instead of a red card that hides the frame rate.
  const w = fakeWorld({ census: (key) => (key === 'pixels' ? 3 : 0), params: new URLSearchParams('bench=crowd') });
  w.play(5 + 20 + 1);
  const s = w.host.surface;
  assert.equal(s.state, 'done', JSON.stringify(s.report.failures));
  assert.deepEqual(s.report.legs[0].census, { pixels: 3, people: 0 }, 'both facts, and the empty crowd among them');
});

test('BENCH1 host: a street leg with no authored track fails by name - the benchmark never stands in a wall', () => {
  const w = fakeWorld({ params: new URLSearchParams('bench=street') });
  w.play(5.2);   // the warmup, then the first measured frame - where a leg's track is read
  const s = w.host.surface;
  assert.equal(s.state, 'failed');
  assert.match(s.report.failures[0], /nowhere to walk/);
  assert.match(s.report.failures[0], /npm run tracks/, 'the failure names the tool that writes one');
});

test('BENCH1 host: the stream leg waits for the journey to START, holds a window you can watch, then ends on the settle', () => {
  // THE FIRST REAL RUN'S DEFECT. `settle()` is true of a stream that never left, so the leg ended in
  // three frames over a journey that never opened - 7 fps over a second and a half nobody could see.
  // The leg now witnesses the stream BUSY first, and holds STREAM_MIN_MS whatever else happens.
  let t = 0;
  const settled = fakeWorld({
    params: new URLSearchParams('bench=stream'),
    settle: () => { t += 1; return t > 120; },   // busy for two seconds of frames, then idle
  });
  settled.play(11);
  assert.equal(settled.host.surface.state, 'done', JSON.stringify(settled.host.surface.failures));
  assert.equal(settled.asked.travel, 1, 'the journey is asked for ONCE, not once a frame');
  const leg = settled.host.surface.report.legs[0];
  assert.ok(leg.frames >= 450, `a window you can watch, not three frames: ${leg.frames}`);
  assert.ok(leg.seconds >= 8, `the leg holds its minimum (STREAM_MIN_MS): ${leg.seconds} s`);

  const stuck = fakeWorld({ params: new URLSearchParams('bench=stream'), settle: () => false });
  stuck.play(61);
  assert.equal(stuck.host.surface.state, 'failed');
  assert.match(stuck.host.surface.report.failures[0], /never settled in 60 s/);

  // ...and a journey that opened no queue at all is its OWN failure, not a 1-second "stream"
  const empty = fakeWorld({ params: new URLSearchParams('bench=stream'), settle: () => true });
  empty.play(61);
  assert.equal(empty.host.surface.state, 'failed');
  assert.match(empty.host.surface.report.failures[0], /never started - the journey opened no queue/);

  // ...and a map that refuses to open one says so at once
  const refused = fakeWorld({ params: new URLSearchParams('bench=stream'), settle: () => true, travel: () => false });
  refused.play(2);
  assert.equal(refused.host.surface.state, 'failed');
  assert.match(refused.host.surface.report.failures[0], /the world could not open a journey/);
});

test('BENCH1 host: a character-creation screen is not a scene - the run WAITS for the body, then refuses to film a wizard', () => {
  // ?class= mints the character asynchronously, and a page measured before it lands films the
  // creation wizard. The first cut checked once, on the first frame, and failed a run whose
  // character was still arriving; the run now waits (BODY_WAIT_MS) and names the absence after it.
  const w = fakeWorld({ params: new URLSearchParams('bench=crowd') });
  w.body.chargenDone = false;   // the wizard is up, and stays up
  w.play(30);
  assert.equal(w.host.surface.state, 'running', 'the character may still be minting - the run waits');
  assert.equal(w.host.surface.report, null, 'and measures nothing while it waits');
  w.play(40);                   // past BODY_WAIT_MS
  const s = w.host.surface;
  assert.equal(s.state, 'failed');
  assert.match(s.report.failures[0], /no character after 60 s/);
  assert.equal(s.report.legs.length, 0, 'no leg was measured over it');
});

test('BENCH1 host: no bindings, no hands - the leg fails rather than pressing a key of the bench\'s own', () => {
  const w = fakeWorld({ codes: () => null, params: new URLSearchParams('bench=crowd') });
  w.play(6);
  const s = w.host.surface;
  assert.equal(s.state, 'failed');
  assert.match(s.report.failures[0], /bindings could not be read/);
  assert.deepEqual(w.asked.press, [], 'nothing was pressed at all');
});

/** THE ARENA, faked: one rat four metres out, a spawner that stands it, and a kill counter the test
 *  drives itself. The fight legs are rooted and proved by kills now, so a fake host has to answer
 *  those three questions the way the dungeon page does. */
const arena = (over = {}) => {
  const rat = { ai: { feet: [0, 0, 4], height: 1.8 }, entity: { health: 40, maxHealth: 40 }, dead: false };
  const said = { kills: 0, spawned: 0, restocked: 0 };
  return {
    foes: () => [rat],
    spawnRat: () => { said.spawned++; return rat; },
    restockArena: () => { said.restocked++; },
    arenaFoe: () => rat,
    arenaKills: () => said.kills,
    said,
    ...over,
  };
};

test('BENCH1 host: the fight legs press ONE swing code on the cadence, and the host decides which system answers', () => {
  // THE MOUSE'S OWN DOOR, held and let go. `SwingWeapon` binds to Mouse1 on the dungeon host and its
  // per-frame latch skips mouse codes, so the synthetic key alone reaches nothing: the leg also holds
  // the host's attack door while the bot holds the swing, which is what fires the bow on release.
  const pressed = [];
  const a = arena();
  const w = fakeWorld({ scene: 'dungeon', params: new URLSearchParams('bench=blade'), census: () => 5, ...a, attack: (held) => pressed.push(!!held) });
  w.play(5 + 6);
  assert.deepEqual(w.asked.prepared, ['blade'], 'the leg prepared its gear once, through the host\'s own door');
  const swings = w.asked.press.filter((c) => c === 'Mouse1').length;
  assert.ok(swings >= 2, `expected swings on the ${SWING_EVERY_MS} ms cadence, saw ${swings}`);
  assert.ok(swings <= Math.ceil((6000 / SWING_EVERY_MS)) + 1, `not more than the cadence allows: ${swings}`);
  assert.equal(w.asked.press.every((c) => c === 'Mouse1' || c === 'KeyW' || c === 'KeyR'), true,
    `only the player's bound codes: ${JSON.stringify(w.asked.press)}`);
  assert.ok(pressed.includes(true), 'the attack door was HELD - the press a mouse button would make');
  assert.ok(pressed.includes(false), 'and let go between swings, because a bow fires on the release');
  assert.ok(pressed.filter(Boolean).length < pressed.length, 'a hold that never ends is not a swing');
  assert.ok(SWING_MS < SWING_EVERY_MS, 'a swing ends before the next begins, or the hold never releases');
  assert.equal(w.asked.press.includes('KeyW'), false, 'the body is ROOTED: a fight leg never presses Walk Forward');
  assert.ok(a.said.restocked > 0, 'and the leg asks the arena to restock its ring every frame it fights');
});

test('BENCH1 host: a fight that kills no rat is a named failure - flailing is not combat', () => {
  const w = fakeWorld({ scene: 'dungeon', params: new URLSearchParams('bench=blade'), census: () => 5, ...arena() });   // the kill count never moves
  w.play(5 + 20 + 1);
  const s = w.host.surface;
  assert.equal(s.state, 'failed');
  assert.match(s.report.failures.join(' | '), /no rat was killed/);
  assert.equal(s.report.legs[0].kills, 0, 'and the card says what the leg actually put down');
});

test('BENCH1 host: a fight leg that kills reports its kills, and the run passes', () => {
  const a = arena();
  const w = fakeWorld({ scene: 'dungeon', params: new URLSearchParams('bench=blade'), census: () => 5, ...a });
  w.play(5 + 10);
  a.said.kills = 2;   // two rats went down in the measured window
  w.play(20);
  const s = w.host.surface;
  assert.equal(s.state, 'done', JSON.stringify(s.report.failures));
  assert.equal(s.report.legs[0].kills, 2, 'the rats the leg\'s own blows put down');
  assert.match(s.report.legs[0].notes.join(' | '), /2 rat\(s\) killed/);
});

test("BENCH1 host: the dungeon walk is the ENGINE's route, followed waypoint by waypoint, not a straight line", () => {
  // the first real run held forward and walked into the first wall it met. The walk leg now asks the
  // host for a plan over the dungeon's own navmesh and steers at its waypoints - so the headings it
  // asked for are the ROUTE's, and a plan that cannot be walked is a named failure.
  const asked = [];
  const w = fakeWorld({
    scene: 'dungeon',
    params: new URLSearchParams('bench=dungeon'),
    census: () => 5,
    foes: () => [{ ai: { feet: [0, 0, 40], height: 1.8 }, entity: { health: 40, maxHealth: 40 }, dead: false }],
    plan: (from, to) => { asked.push([from[0], to[0]]); return [[from[0], from[1], from[2]], [from[0] + 6, from[1], from[2] + 6], [to[0], to[1], to[2]]]; },
  });
  w.play(5 + 4);
  assert.equal(asked.length >= 1, true, 'the leg asked the engine for a route');
  assert.equal(w.asked.press.includes('KeyW'), true, 'and walked it, holding the player\'s own Walk Forward');
  // a page with no plan at all says so, by name
  const blind = fakeWorld({ scene: 'dungeon', params: new URLSearchParams('bench=dungeon'), census: () => 5, foes: () => [{ ai: { feet: [0, 0, 40] }, entity: { health: 1 }, dead: false }] });
  blind.play(5 + 2);
  assert.equal(blind.host.surface.state, 'failed');
  assert.match(blind.host.surface.report.failures[0], /no dungeon route/);
});

test('BENCH1 host: stop() mid-run is a named failure, and the surface is torn down', () => {
  const w = fakeWorld({ params: new URLSearchParams('bench=crowd') });
  w.play(6);
  w.host.stop();
  const s = w.host.surface;
  assert.equal(s.state, 'failed');
  assert.match(s.report.failures.join(' | '), /stopped before it finished/);
  w.host.dispose();
  assert.equal(w.asked.press.length, w.asked.release.length, 'every key pressed was let go - a held key with no hand on it is the disease the touch layer guards against');
});

test('BENCH1 host: the card\'s text is the report\'s text - one writer, the overlay\'s', () => {
  const w = fakeWorld({ params: new URLSearchParams('bench=crowd') });
  w.play(5 + 20 + 1);
  const text = w.host.surface.text();
  assert.match(text, /^Benchmark - \d{4}-/);
  assert.match(text, /SCORE \d+ \(A\)/);
  assert.ok(text.includes('fake GPU'), 'the machine the numbers are of');
  assert.ok(text.includes('Update 42'), 'and the build');
  assert.equal(text.includes('FAILED:'), false, 'a clean run says nothing about failure');
});

test('BENCH1 host: the host is a module the wiring ticks - it never reaches for the game by name', () => {
  const src = readFileSync(new URL('../../../src/scenes/benchHost.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
  for (const forbidden of ['window.__move', 'window.__pose', 'window.__warpTo', '__shotReady']) {
    assert.equal(code.includes(forbidden), false, `the host reaches for ${forbidden} - the shot gate's surface is a probe's, not a contract`);
  }
  assert.ok(existsSync(new URL('../../../src/systems/bench/tracks.js', import.meta.url)), 'the route module the host imports must exist, even empty');
});
