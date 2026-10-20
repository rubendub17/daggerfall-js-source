import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickWalk, advancePath, pathLengthFrom, navSites, walkGoals, PATH_FOE_GOALS, PATH_MAX_GOALS, PATH_MIN_STEP_M, PATH_REACH_M } from '../../../src/systems/bench/dungeonPath.js';
import { distanceTo } from '../../../src/systems/bench/track.js';

// BENCH1's dungeon walk: the route is the engine's own (navmesh.js findPath, handed in as `plan`),
// and this module is only the coarse part around it - which destination a walk takes, which waypoint
// is next within a camera's reach, and how far the body actually came. So the fake `plan` below is
// the whole dungeon: every refusal it makes is a room behind a wall the navmesh will not cross, and
// every path it answers is a corridor that turns.

test('BENCH1 dungeon walk: the first goal the engine can reach is the walk, and the query is asked once per goal until one answers', () => {
  const from = [0, 0, 0];
  const goals = [[100, 0, 0], [0, 0, 100], [40, 0, 40]];
  const asked = [];
  const plan = (a, to) => {
    asked.push(to);
    if (to !== goals[2]) return null;              // the first two rooms sit behind a wall the navmesh will not cross
    return [[a[0], a[1], a[2]], [20, 0, 20], [40, 0, 40]];   // and the third answers a corridor that turns
  };
  const walk = pickWalk({ plan, from, goals });
  assert.equal(asked.length, 3, `a plan that answers on the third goal is asked exactly three times, not ${asked.length}`);
  assert.deepEqual(asked, goals, 'and asked for the goals in the order it was given them');
  assert.ok(walk, 'the third room is reachable, so there is a walk');
  assert.deepEqual(walk.goal, goals[2], 'the goal it answers with is the one that answered');
  assert.deepEqual(walk.points, [[20, 0, 20], [40, 0, 40]], 'and the head is trimmed of the point the body already stands on');
  for (const p of walk.points) {
    assert.ok(distanceTo(from, p) > PATH_REACH_M, `no point on a walk is one the body is already standing on: ${JSON.stringify(p)}`);
  }
  // the first goal that answers is THE goal: a reachable second room is never walked to instead
  assert.equal(pickWalk({ plan: () => [[0, 0, 0], [50, 0, 0]], from, goals }).goal, goals[0]);
});

test('BENCH1 dungeon walk: a plan of one point or of a first hop under PATH_MIN_STEP_M is refused, and every goal unreachable answers null', () => {
  const from = [0, 0, 0];
  const goals = [[10, 0, 0]];
  // the engine answering a single point - where the body already stands - is a place, not a walk
  assert.equal(pickWalk({ plan: () => [[0, 0, 0]], from, goals }), null);
  // a whole plan shorter than a walk: the destination is at the body's own feet
  assert.equal(pickWalk({ plan: () => [[0, 0, 0], [2, 0, 0]], from, goals }), null, `2 m is under the ${PATH_MIN_STEP_M} m a walk must cover`);
  // ...and the minimum itself IS a walk, so the refusals above are the law and not a broken picker
  const ok = pickWalk({ plan: () => [[0, 0, 0], [PATH_MIN_STEP_M, 0, 0]], from, goals });
  assert.deepEqual(ok?.points, [[PATH_MIN_STEP_M, 0, 0]], `a hop of exactly ${PATH_MIN_STEP_M} m is walked`);
  // A SHORT FIRST PACE IS STILL A WALK. A funnel's taut path begins with the corner a metre ahead, and
  // the first cut measured THAT hop - which refused every route out of a real dungeon ("no route to
  // walk, forty-two destinations tried") over a mesh the same dungeon's foes were walking on.
  const corner = pickWalk({ plan: () => [[0, 0, 0], [1.2, 0, 1.2], [1.2, 0, 20]], from, goals });
  assert.equal(corner?.points.length, 2, 'the metre-ahead corner and the twenty-metre run behind it');
  // a dungeon whose every candidate room is unreachable: the leg gets no walk and must say so
  assert.equal(pickWalk({ plan: () => null, from, goals: [[10, 0, 0], [20, 0, 0]] }), null);
});

test('BENCH1 dungeon walk: fifty goals offered, the query is asked at most PATH_MAX_GOALS times', () => {
  const goals = Array.from({ length: 50 }, (_, i) => [i * 10 + 10, 0, 0]);
  let calls = 0;
  const plan = () => { calls++; return null; };
  assert.equal(pickWalk({ plan, from: [0, 0, 0], goals }), null);
  assert.equal(calls, PATH_MAX_GOALS, `${PATH_MAX_GOALS} destinations tried and no more: ${calls}`);
  calls = 0;
  assert.equal(pickWalk({ plan, from: [0, 0, 0], goals, maxGoals: 3 }), null);
  assert.equal(calls, 3, 'a caller may narrow it');
  calls = 0;
  assert.equal(pickWalk({ plan, from: [0, 0, 0], goals: goals.slice(0, 2) }), null);
  assert.equal(calls, 2, 'and a shorter list is never padded with questions it has no goal for');
  calls = 0;
  assert.equal(pickWalk({ plan, from: [0, 0, 0], goals, maxGoals: 0 }), null);
  assert.equal(calls, 0, 'a walk that may try nothing tries nothing');
});

test('BENCH1 dungeon walk: a waypoint is not left behind until it is within reach, the cursor never goes backwards, and the last waypoint ends the walk', () => {
  const path = [[10, 0, 0], [20, 0, 0], [30, 0, 0], [40, 0, 0]];
  // the body at the corridor's mouth: the first waypoint is what to steer at
  assert.deepEqual(advancePath(path, 0, [0, 0, 0]), { index: 0, done: false, target: path[0] });
  // beside the first waypoint but outside the reach: STILL steering at it, not past it
  assert.deepEqual(advancePath(path, 0, [10, 0, 1.5]), { index: 0, done: false, target: path[0] });
  // stood on it: behind us, and the second is the target
  assert.deepEqual(advancePath(path, 0, [10, 0, 0]), { index: 1, done: false, target: path[1] });
  // shoved back to the mouth with the cursor at the third: it re-aims at the cursor's waypoint, never behind it
  assert.deepEqual(advancePath(path, 2, [0, 0, 0]), { index: 2, done: false, target: path[2] });
  // the walk's last waypoint reached is the walk's end
  assert.deepEqual(advancePath(path, 3, [40, 0, 0.5]), { index: 4, done: true, target: null });
  // a coarser walker is obeyed: the reach is the caller's
  assert.equal(advancePath(path, 0, [10, 0, 2], 2).index, 1, 'a wider reach leaves the first waypoint behind from further away');
  // nothing to walk: the empty answer, so a leg with no walk is not a leg with a crash
  assert.deepEqual(advancePath([], 0, [0, 0, 0]), { index: 0, done: true, target: null });
  assert.deepEqual(advancePath(null, 0, [0, 0, 0]), { index: 0, done: true, target: null });
});

test('BENCH1 dungeon walk: pathLengthFrom measures from where the body stands to the path\'s end, and a one-point path is no distance', () => {
  const path = [[10, 0, 0], [20, 0, 0], [30, 0, 0]];
  assert.equal(pathLengthFrom(path, [0, 0, 0]), 30, 'ten metres to the head and twenty along the path');
  assert.equal(pathLengthFrom(path, [10, 0, 5]), 25, 'a body beside the head owes the five metres to the path, then the path');
  assert.equal(pathLengthFrom(path, [20, 0, 0]), 10, 'a body standing on the middle waypoint owes only the leg after it');
  assert.equal(pathLengthFrom(path, [40, 0, 0]), 10, 'a body past the end owes only the walk back to it - never a negative leg');
  assert.equal(pathLengthFrom([[5, 0, 0]], [0, 0, 0]), 0, 'one point is a place: nothing is walked along it');
  assert.equal(pathLengthFrom([], [0, 0, 0]), 0);
  assert.equal(pathLengthFrom(null, [0, 0, 0]), 0);
});

test('BENCH1 dungeon walk: the query is a parameter, so a bench with no query, no body or nowhere to go answers null rather than guessing', () => {
  const goals = [[10, 0, 0]];
  assert.equal(pickWalk({ plan: null, from: [0, 0, 0], goals }), null, 'no engine query, no walk');
  assert.equal(pickWalk({ from: [0, 0, 0], goals }), null);
  assert.equal(pickWalk({ plan: () => [[0, 0, 0], [10, 0, 0]], from: null, goals }), null, 'no body, no walk from it');
  assert.equal(pickWalk({ plan: () => [[0, 0, 0], [10, 0, 0]], from: [0, 0, 0], goals: [] }), null, 'nowhere to go');
  assert.equal(pickWalk(), null, 'and nothing at all answers nothing at all');
  // a query that answers something that is not a path is refused, not walked
  assert.equal(pickWalk({ plan: () => 'a corridor', from: [0, 0, 0], goals }), null);
});

test('BENCH1 dungeon walk: the walk is offered the DUNGEON and not only its foes - the floor\'s places, farthest first and spread across the range', () => {
  // THE OWNER'S SECOND WATCH: "in the dungeon the guy isn't going through the dungeon". The leg was
  // offered the foes and nothing else, so it walked to the two rats the fight legs had just left
  // standing and walked back. The floor is the thing to cross, and `sites` are its own places (one
  // centre per navmesh polygon, navmesh.js `navSites`).
  const from = [0, 0, 0];
  const sites = Array.from({ length: 16 }, (_, i) => [10 * (i + 1), 0, 0]);   // one every 10 m, out to 160 m
  const goals = walkGoals({ sites, from, maxGoals: 8 });
  assert.equal(goals.length, 8, `eight questions asked: ${JSON.stringify(goals)}`);
  assert.deepEqual(goals[0], [160, 0, 0], 'the FIRST question is the far end of the dungeon - the walk crosses the floor, not the room it stands in');
  for (let i = 1; i < goals.length; i++) {
    assert.ok(distanceTo(from, goals[i - 1]) > distanceTo(from, goals[i]), `the questions come back DOWN the range: ${JSON.stringify(goals)}`);
  }
  assert.ok(distanceTo(from, goals[goals.length - 1]) <= 30,
    `and the spread reaches the near end too, not only the far half: ${JSON.stringify(goals.map((g) => g[0]))}`);
});

test('BENCH1 dungeon walk: a place this leg already walked to, and one at the body\'s own feet, are not destinations', () => {
  const from = [0, 0, 0];
  const sites = [[2, 0, 0], [40, 0, 0], [52, 0, 0], [80, 0, 0]];
  const seen = [[40, 0, 0], [80, 0, 6]];
  assert.deepEqual(walkGoals({ sites, from, seen, visitedM: 8 }), [[52, 0, 0]],
    'the 40 m and 80 m rooms are behind us (within the memory radius of where the leg has been), the 2 m one is a turn rather than a walk, and the room past the first is new');
  // no memory is no filter, and the memory radius is the caller's
  assert.equal(walkGoals({ sites, from }).length, 3, 'a leg with no memory of where it has been is offered every place but the one at its feet');
  assert.deepEqual(walkGoals({ sites: [[40, 0, 0]], from, seen: [[40, 0, 0]], visitedM: 0 }), [[40, 0, 0]],
    'visitedM of 0 means the caller keeps no memory, not that everything is visited');
});

test('BENCH1 dungeon walk: the foes keep a fallback\'s share of the questions, and a page with no floor walks to its foes as it always did', () => {
  const from = [0, 0, 0];
  const sites = Array.from({ length: 16 }, (_, i) => [10 * (i + 1), 0, 0]);
  const foes = [[30, 0, 20], [400, 0, 0]];
  const goals = walkGoals({ sites, foes, from, maxGoals: 8 });
  const isFoe = (g) => foes.some((f) => distanceTo(f, g) === 0);
  assert.equal(goals.length, 8, `the leg asks its whole budget: ${JSON.stringify(goals)}`);
  assert.equal(goals.filter(isFoe).length, PATH_FOE_GOALS, `the foes keep ${PATH_FOE_GOALS} of the eight - the floor cannot take every question`);
  assert.equal(goals.slice(0, goals.length - PATH_FOE_GOALS).some(isFoe), false, 'and the floor\'s places are asked first');
  // A PAGE WITH NO PLACES IS THE WALK THE LEG ALWAYS HAD: the foes, farthest first
  assert.deepEqual(walkGoals({ foes, from, maxGoals: 8 }), [[400, 0, 0], [30, 0, 20]]);
  // and nowhere to ask about is nothing asked
  assert.deepEqual(walkGoals({ from }), []);
  assert.deepEqual(walkGoals(), [], 'no body, no destinations');
  assert.deepEqual(walkGoals({ sites, from, maxGoals: 0 }), [], 'a walk that may ask nothing asks nothing');
});

test('BENCH1 dungeon walk: a waypoint the body got PAST between two frames is behind it, however tight the reach', () => {
  // The bench runs on the machines whose frame rate IS the measurement: at 10 fps a body at a run
  // covers more than the 0.6 m reach between two frames, and a walker that only asked "within the
  // reach" read the corner it had just passed as one still ahead - and turned round in the corridor.
  const path = [[10, 0, 0], [20, 0, 0], [20, 0, 20]];
  assert.deepEqual(advancePath(path, 0, [16, 0, 0], 0.6), { index: 1, done: false, target: path[1] },
    'past the first waypoint and nearer the second: steer at the second');
  assert.deepEqual(advancePath(path, 0, [8, 0, 0], 0.6), { index: 0, done: false, target: path[0] },
    'a body still short of the waypoint steers at it, near the next one or not');
  assert.deepEqual(advancePath(path, 2, [18, 0, 19], 0.6), { index: 2, done: false, target: path[2] },
    'the last waypoint has no next: the reach alone decides it');
  assert.deepEqual(advancePath(path, 2, [20, 0, 19.6], 0.6), { index: 3, done: true, target: null });
});

// THE DESTINATIONS THEMSELVES. `navSites` reads the mesh the dungeon's own foes path over and answers
// the floor's places; `walkGoals` decides which of them a leg asks the engine about. The fixture below
// is a chf as the bake leaves it - `mesh.verts` in GRID units (cells, relative to the mesh's origin),
// each polygon an id ring into them, and the cell size and origin that turn grid into world - so no
// baking is needed to ask where the floor is.

/** A mesh of `count` one-cell polygons in a row, 4 m cells from the origin (100, -50). */
function fakeChf(count = 2) {
  const verts = [];
  const polys = [];
  for (let i = 0; i < count; i++) {
    const s = verts.length;
    verts.push({ x: i, y: 0, z: 0 }, { x: i + 1, y: 0, z: 0 }, { x: i + 1, y: 0, z: 1 }, { x: i, y: 0, z: 1 });
    polys.push({ verts: [s, s + 1, s + 2, s + 3] });
  }
  return { cs: 4, xmin: 100, zmin: -50, colliders: null, mesh: { verts, polys } };
}

test('BENCH1 dungeon floor: a navmesh answers one place per polygon, its centre in WORLD units - not in the grid the mesh is cut on', () => {
  const sites = navSites(fakeChf());
  assert.equal(sites.length, 2, `one place a polygon: ${JSON.stringify(sites)}`);
  assert.deepEqual(sites[0], [102, 0, -48], 'the cell\'s centre, through cs and the mesh\'s own origin');
  assert.deepEqual(sites[1], [106, 0, -48], 'and the next cell\'s own centre - each polygon is its own place');
  for (const p of sites) assert.equal(p.length, 3, 'a place is [x, y, z]: what findPath takes as a goal');
});

test('BENCH1 dungeon floor: no mesh, no polys, and a poly naming a vertex the mesh has not got are no places - not an error', () => {
  assert.deepEqual(navSites(null), [], 'a page whose bake has not landed has no floor to offer');
  assert.deepEqual(navSites({}), []);
  const empty = fakeChf();
  empty.mesh.polys = [];
  assert.deepEqual(navSites(empty), [], 'a mesh with no polygons is no places');
  const holed = fakeChf();
  holed.mesh.polys.push({ verts: [0, 99] }, { verts: [] }, null);
  assert.deepEqual(navSites(holed), navSites(fakeChf()), 'a broken polygon is skipped, and the good ones still answer');
});

test('BENCH1 dungeon floor: a place\'s height is the polygon\'s own surface, and 0 when the mesh carries no height layer', () => {
  // A stacked dungeon has a lower floor under an upper one, and findPath picks each end's LEVEL from its
  // y - a place handed "the tallest top above it" would send the walk to the floor above. `polyHeight`
  // is the mesh's own answer, and a mesh with no colliders has none, which is 0.
  const chf = fakeChf(1);
  chf.colliders = [{ x0: 90, x1: 130, z0: -60, z1: -40, top: -3, bottom: -4 }];   // a dungeon floor below zero
  assert.equal(navSites(chf)[0][1], -3, 'the floor under the polygon, not the world\'s zero');
  assert.equal(navSites(fakeChf())[0][1], 0, 'no height layer, no height: 0, as before');
});

