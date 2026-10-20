import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createBenchHost, createDungeonBench, SWING_MS, SWING_EVERY_MS, ARENA_RATS, ARENA_SPAWN_TRIES, DOOR_OPEN_M } from '../../../src/scenes/benchHost.js';
import { distanceTo } from '../../../src/systems/bench/track.js';
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

test("BENCH1 host: the dungeon walk is the ENGINE's route over the dungeon's own FLOOR - and a body it pins plans again", () => {
  // TWO WATCHES, ONE LEG. The first: the walk asked the mesh for a route and followed it waypoint by
  // waypoint (holding forward and walking into the first wall it met was the first real run). The
  // second, the owner's - "in the dungeon the guy isn't going through the dungeon... navigate, walk, go
  // into rooms, turn around": the destinations were the foes and ONLY the foes, so the leg walked to
  // the rats the fight legs had just left standing and walked back, and the floor it was supposed to
  // cross was never a destination at all. Now the floor's own places are the destinations (`sites`,
  // one centre per navmesh polygon) and the foes are the fallback.
  const asked = [];
  const sites = [[120, 0, 0], [60, 0, 0], [90, 0, 0]];
  const w = fakeWorld({
    scene: 'dungeon',
    params: new URLSearchParams('bench=dungeon'),
    census: () => 5,
    foes: () => [{ ai: { feet: [0, 0, 4], height: 1.8 }, entity: { health: 40, maxHealth: 40 }, dead: false }],
    sites: () => sites,
    plan: (from, to) => { asked.push(to); return [[from[0], from[1], from[2]], [from[0] + 6, from[1], from[2] + 6], [to[0], to[1], to[2]]]; },
  });
  w.play(5 + 4);
  assert.equal(asked.length >= 1, true, 'the leg asked the engine for a route');
  assert.deepEqual(asked[0], [120, 0, 0], `its FIRST question is the far end of the floor, not the rat four metres away: ${JSON.stringify(asked[0])}`);
  assert.equal(w.asked.press.includes('KeyW'), true, 'and walked it, holding the player\'s own Walk Forward');
  // THE STUCK WATCH. This fake body never moves, which is a body pinned by the collider: the watch is
  // set in metres and milliseconds, so it fires - the old one compared a point with a point, never
  // fired, and spent the whole leg against the same jamb.
  w.play(4);
  assert.ok(asked.length >= 2, `a pinned body plans again rather than walk into the same wall for the leg: ${JSON.stringify(asked)}`);
  assert.ok(distanceTo(asked[1], [120, 0, 0]) > 8, `and the second plan is somewhere ELSE: ${JSON.stringify(asked[1])}`);
  // AND THE LEG'S OWN PROOF AT ITS END: the metres it covered, which a pinned body owes nothing of.
  w.play(20);
  const s = w.host.surface;
  assert.equal(s.state, 'failed');
  assert.match(s.report.failures.join(' | '), /under the 8 m a walked dungeon owes/, 'a leg that covered no ground says so by name, not in a note');
  assert.match(s.report.legs[0].notes.join(' | '), /route\(s\) abandoned as pinned/, 'and reports the routes it had to abandon');
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

test('BENCH1 host: a walker opens the door it is standing at with the player\'s own Activate, and only that one', () => {
  // "how it walk but cant open doors": a dungeon's navmesh leaves an unlocked action door OUT of the wall
  // it bakes (the door is one its own foes walk through), so the route crosses a shut door and the body
  // walks into the panel. The walker looks at it and presses the player's ActivateCenterObject - the key
  // a person's E is - and the host's own PlayerActivate opens it.
  const walk = (doors) => {
    const w = fakeWorld({
      scene: 'dungeon',
      params: new URLSearchParams('bench=dungeon'),
      census: () => 5,
      codes: () => ({ forward: 'KeyW', run: 'KeyR', swing: 'Mouse1', activate: 'KeyE' }),
      foes: () => [],
      sites: () => [[0, 0, 120], [0, 0, 60]],
      plan: (from, to) => [[from[0], from[1], from[2]], [to[0], to[1], to[2]]],
      doors,
    });
    w.play(5 + 3);
    return w;
  };
  const closed = { pos: [1, 1.1, 1], key: 'act:1:1', closed: true, locked: false, special: false };
  const at = walk(() => [closed]);
  assert.ok(at.asked.press.includes('KeyE'), 'the closed door in the way is pressed with the player\'s Activate');
  assert.ok(at.asked.release.includes('KeyE'), 'and let go again - a held key with no hand on it is the disease');
  const presses = at.asked.press.filter((c) => c === 'KeyE').length;
  assert.ok(presses <= Math.ceil(3000 / 700) + 1, `one press per beat, not one a frame: ${presses} in 3 s`);

  // A door that is already OPEN is not a door in the way, and a LOCKED one cannot be opened by hand - the
  // mesh keeps a locked door as a wall, so a route never crosses one.
  const open = walk(() => [{ ...closed, closed: false }]);
  assert.equal(open.asked.press.includes('KeyE'), false, 'an open door is walked through, not pressed');
  const locked = walk(() => [{ ...closed, locked: true }]);
  assert.equal(locked.asked.press.includes('KeyE'), false, 'a locked door is not rattled - the walk cannot open it');
  // ...and a door behind the shoulder is not the way the body is going
  const behind = walk(() => [{ ...closed, pos: [0, 1.1, -1] }]);
  assert.equal(behind.asked.press.includes('KeyE'), false, 'a door behind the walk is one it will come back to');
  // the reach is the player's own activation ray, not the whole room
  const far = walk(() => [{ ...closed, pos: [0, 1.1, DOOR_OPEN_M + 2] }]);
  assert.equal(far.asked.press.includes('KeyE'), false, 'a door past the press reach is walked up to first');
});

// THE DUNGEON PAGE ITSELF. The torch and the ring are wired in `createDungeonBench` - the module
// scenes/dungeon.js hands the page's own doors to - so they are tested there, over a fake page.
/** The page: a spawner that stands rats where it is told, a pack, a light and a drawn weapon. */
function fakeDungeon(over = {}) {
  const said = { keys: [], released: [], stowed: [], equipped: [], spawned: [], aims: [], warps: [], attack: [] };
  const rats = [];
  const entity = { chargenDone: true, gender: 'male', health: 100, maxHealth: 100, maxMagicka: 0 };
  const state = { lit: false, drawn: false, clock: 1000 };
  const ratAt = (pos) => {
    const rec = { ai: { feet: [...pos], height: 0.6 }, entity: { health: 12, maxHealth: 12 }, dead: false };
    rats.push(rec);
    said.spawned.push([pos[0], pos[1], pos[2]]);
    return rec;
  };
  const host = {
    params: new URLSearchParams('bench=blade'),
    feet: () => [0, 0, 0],
    heading: () => 0,
    turnBy: () => {},
    bindings: () => ({}),
    codeForAction: (_store, action) => ({
      MoveForwards: 'KeyW', Run: 'KeyR', SwingWeapon: 'Mouse1', ActivateCenterObject: 'KeyE',
      ReadyWeapon: 'KeyQ', TorchToggleLight: 'KeyT',
    })[action] ?? null,
    entity: () => entity,
    equip: (it) => said.equipped.push(it),
    stow: (it) => said.stowed.push(it),
    foes: () => rats,
    spawnRat: (pos) => ratAt(pos),
    warp: (p) => { said.warps.push([...p]); return true; },
    attack: (held) => said.attack.push(!!held),
    aimAt: (p) => said.aims.push([...p]),
    level: () => {},
    entry: () => [0, 0, 0],
    plan: () => null,
    lit: () => state.lit,
    drawn: () => state.drawn,
    ready: () => { state.drawn = !state.drawn; },
    document: null,
    ...over,
  };
  const bench = createDungeonBench(host);
  const play = (seconds) => {
    const steps = Math.round((seconds * 1000) / FRAME_MS);
    for (let i = 0; i < steps; i++) { state.clock += FRAME_MS; bench.tick(FRAME_MS / 1000, state.clock); }
    return bench.surface;
  };
  return { bench, play, said, rats, entity, state };
}

/** A window, so the page's synthetic key edges are visible: the dungeon page's presses are
 *  KeyboardEvents on the window (ui/gamepadInput's own idiom), and Node has neither. */
function withWindow(fn) {
  const realWindow = globalThis.window;
  const realKeyboardEvent = globalThis.KeyboardEvent;
  const keys = [];
  globalThis.window = { dispatchEvent: (e) => { keys.push(`${e?.type}:${e?.code}`); return true; } };
  globalThis.KeyboardEvent = class { constructor(type, init = {}) { this.type = type; this.code = init.code; } };
  try { return fn(keys); } finally {
    globalThis.window = realWindow;
    globalThis.KeyboardEvent = realKeyboardEvent;
  }
}

test('BENCH1 dungeon page: the run carries a TORCH - it is stowed from the Test Room\'s rows and lit with the player\'s own key', () => {
  // The dungeon is dark until somebody lights something, and the pinned character carries no torch: the
  // Light-or-douse press lit nothing at all, for a whole release. So the torch is STOWED the way the
  // quiver is (the Test Room's one item table - the bench equips, it never mints), and the press is the
  // player's own binding.
  const found = withWindow((keys) => {
    const w = fakeDungeon();
    w.play(5 + 2);
    w.state.lit = true;   // stop the "still dark" retry chain before the test ends
    return { w, keys };
  });
  assert.equal(found.w.said.stowed.filter((it) => it?.templateIndex === 247).length, 1,
    `a torch is stowed once, from the Test Room's light row: ${JSON.stringify(found.w.said.stowed.map((i) => i?.templateIndex))}`);
  assert.ok(found.keys.includes('keydown:KeyT'), `the player's own Light-or-douse is pressed: ${JSON.stringify(found.keys)}`);
});

test('BENCH1 dungeon page: the walk sheathes what a fight was holding before it lights, because a drawn bow has no free hand', () => {
  const found = withWindow(() => {
    const w = fakeDungeon({ params: new URLSearchParams('bench=dungeon'), plan: () => null, sites: () => [] });
    w.state.drawn = true;   // the bow leg left a drawn bow in both hands
    w.play(5.2);
    w.state.lit = true;
    return w;
  });
  assert.equal(found.state.drawn, false, 'the walk put the weapon away - a torch is carried in a free hand');
});

test('BENCH1 dungeon page: the ring stands FOUR rats in two ranks, and refills a slot whose rat fell', () => {
  // "the one rat died in the mele fight and archer and magic only stare at the floor": a ring of two is
  // emptied by a melee leg. Four are stood - two at arm's length, two across the room - and each slot
  // remembers its own rat, so what falls is replaced where it stood.
  const w = fakeDungeon();
  w.play(5 + 2);
  const near = w.said.spawned.filter((p) => Math.abs(distanceTo([0, 0, 0], p) - 2.5) < 0.5);
  const far = w.said.spawned.filter((p) => Math.abs(distanceTo([0, 0, 0], p) - 7) < 0.5);
  assert.equal(w.said.spawned.length, ARENA_RATS, `the ring is ARENA_RATS rats: ${JSON.stringify(w.said.spawned.map((p) => distanceTo([0, 0, 0], p)))}`);
  assert.equal(near.length, 2, 'two at arm\'s length, for a blade and a spell');
  assert.equal(far.length, 2, 'two across the room, for a bow');
  // A RAT THAT FELL IS A SLOT TO FILL AGAIN, not a ring that shrinks.
  w.rats[0].dead = true;
  w.play(0.2);
  assert.equal(w.said.spawned.length, ARENA_RATS + 1, 'the fallen rat\'s own slot is stood again');
  w.state.lit = true;
});

test('BENCH1 dungeon page: the blade fights the NEAR rat and the bow and the spell the FAR one - the ring\'s two ranks are the point', () => {
  const aimOf = (leg) => {
    const w = fakeDungeon({ params: new URLSearchParams(`bench=${leg}`) });
    w.play(5 + 1);
    w.state.lit = true;
    const last = w.said.aims.at(-1) ?? null;
    return last ? distanceTo([0, 0, 0], last) : null;
  };
  const near = aimOf('blade');
  const far = aimOf('bow');
  const cast = aimOf('spell');
  assert.ok(near !== null && near > 1.5 && near < 3.5, `a blade is aimed at the near rank: ${near}`);
  assert.ok(far !== null && far > 5.5 && far < 8.5, `a bow is aimed at the far rank: ${far}`);
  // A SPELL LEAVES THE EYE, not the hand: at arm's length the look is pitched 30 degrees down at the rat,
  // which is the "staring at the floor and casting" a person watching reported.
  assert.ok(cast !== null && cast > 5.5 && cast < 8.5, `a spell is aimed at the far rank: ${cast}`);
});

test('BENCH1 dungeon page: a spawner that stands nothing is a NAMED failure, not a body casting at a wall', () => {
  const w = fakeDungeon({ spawnRat: () => null });
  w.play(5 + 3);
  w.state.lit = true;
  const s = w.bench.surface;
  assert.equal(s.state, 'failed');
  assert.match(s.failures.join(' | '), /no rat is standing in the ring/, `a ring that stood nothing says so: ${JSON.stringify(s.failures)}`);
  assert.ok(ARENA_SPAWN_TRIES >= 2, 'a slot is asked for more than once before it gives up');
});
