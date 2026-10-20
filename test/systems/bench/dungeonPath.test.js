import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickWalk, advancePath, pathLengthFrom, PATH_MAX_GOALS, PATH_MIN_STEP_M, PATH_REACH_M } from '../../../src/systems/bench/dungeonPath.js';
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
