// BENCH1 - THE DUNGEON WALK (2026-10-19). The city's legs walk a route an author wrote down; a
// dungeon's cannot. A dungeon is rooms joined by corridors, and the straight line between two rooms
// crosses the wall between them - so a dungeon leg has to be PLANNED, at run time, by the engine that
// already knows the dungeon: src/ai/nav/navmesh.js's findPath answers the waypoints from a body to a
// room, or null when the navmesh cannot join them. There is no list of points to author, because the
// room is picked when the run starts and the route depends on where the body already stands.
//
// THE PATH-FINDER IS THE GAME'S, HANDED IN. Nothing here finds a path: the caller passes
// `plan(from, to)` and the query stays in the page, where the dungeon's chf is. A second path-finder
// in the bench would disagree with the engine at exactly the places that matter - a doorway too
// narrow, a stair too steep, a corridor the navmesh has not built - and the leg would then measure the
// bench's idea of the dungeon instead of the game's. The engine's own follower
// (src/ai/enhancedMotor.js) walks the same waypoints for the game's NPCs; this is the same walk with a
// coarser hand on it.
//
// SO WHAT IS LEFT HERE IS THE COARSE PART, the part a bot steering a CAMERA owes a corridor: which of
// the candidate destinations can be reached at all (a foe in an unreachable room is a leg spent
// staring at a wall, and it must say so as a null rather than as twenty seconds of standing still),
// which waypoint is next within a reach wider than the engine's own 0.45 m - the bench steers a look
// and not a capsule, and a camera's idea of "arrived" is a metre rather than a body's width - and how
// far the walk actually went, so "the walk went somewhere" is a number in the report rather than an
// argument from the screenshots.
//
// Pure: the query is a parameter, the body is `at`, and nothing here owns a clock. The same code is
// tested on a fake dungeon in test/systems/bench/dungeonPath.test.js and plans the real one in the page.

import { distanceTo } from './track.js';

/** How near a waypoint counts as reached. The engine's own follower uses WP_REACH 0.45 m for a body;
 *  a bot steering a camera cuts the corner far wider than a capsule can, so 1.2 m is the same idea at
 *  the bench's resolution - nearer than this and the steerer would chase a point it has already passed. */
export const PATH_REACH_M = 1.2;
/** How many candidate destinations a walk tries before giving up. Eight rooms is a leg that walks
 *  somewhere; a hundred is a run spending its twenty seconds asking the navmesh questions - and a
 *  dungeon with eight unreachable rooms in a row has no walk to bench today, which is the honest answer. */
export const PATH_MAX_GOALS = 8;
/** A plan whose first hop is shorter than this is not a walk. Three metres is three of the steerer's
 *  paces: under it the destination is at the body's own feet, and walking there measures a turn and
 *  not a corridor. */
export const PATH_MIN_STEP_M = 3;

/** A point as [x, y, z], or null when it is not one - the engine answers arrays, a caller's body may be
 *  {x, z}, and everything here is horizontal, so a y that is not a number is 0. */
function pointOf(p) {
  const x = p?.[0] ?? p?.x;
  const z = p?.[2] ?? p?.z;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const y = p?.[1] ?? p?.y;
  return [x, Number.isFinite(y) ? y : 0, z];
}

/** The engine's answer as a walk this bench can steer, or null. A plan of one point is a place and not
 *  a walk, and a plan that only names where the body already stands is no walk either. The head of the
 *  path is TRIMMED of the points the body is already standing on - the engine's first waypoint is
 *  regularly the start itself - because a steerer handed a point it is on top of turns on the spot.
 *
 *  AND THE MINIMUM IS THE WALK'S OWN LENGTH, NOT ITS FIRST PACE. A funnel's taut path regularly begins
 *  with the corner one metre ahead, and a rule on the first hop refused EVERY route out of a real
 *  dungeon: the walk leg reported "no route to walk, forty-two destinations tried" over a mesh the
 *  same foes were walking on. What must not count as a walk is a plan that goes nowhere, so the number
 *  measured is the distance the body would actually cover (`pathLengthFrom`). */
function asWalk(answer, from) {
  if (!Array.isArray(answer)) return null;
  const points = [];
  for (const raw of answer) {
    const p = pointOf(raw);
    if (p) points.push(p);
  }
  if (points.length < 2) return null;
  const ahead = points.filter((p) => distanceTo(from, p) > PATH_REACH_M);
  if (!ahead.length) return null;
  // THE WHOLE ANSWER MEASURED, not the trimmed remainder: the head is dropped only because a steerer
  // must not be handed the point it stands on, and a metre-ahead corner that was trimmed away is
  // still a metre the body walks.
  if (!(pathLengthFrom(points, from) >= PATH_MIN_STEP_M)) return null;
  return ahead;
}

/** A plan for the walk: ask the engine for a route from `from` to each goal in turn, and take the
 *  first that answers. `goals` are [x,y,z] candidate destinations, already in priority order.
 *  `plan(from, to)` -> number[][] | null (the engine's findPath, injected).
 *  Answers { points, goal } or null when no goal could be reached. `points` never includes a
 *  point the body is already standing on, and a plan shorter than PATH_MIN_STEP_M is refused.
 *
 *  The goals are tried in the order they were given and `plan` is asked at most `maxGoals` times, so a
 *  caller with a room full of foes cannot spend the leg on questions. A missing query, a body that is
 *  not a point and an empty list all answer null: the leg says why, this module does not guess. */
export function pickWalk({ plan, from, goals, maxGoals = PATH_MAX_GOALS } = {}) {
  if (typeof plan !== 'function') return null;
  if (!Array.isArray(goals) || !goals.length) return null;
  const start = pointOf(from);
  if (!start) return null;
  const cap = Number.isFinite(Number(maxGoals)) ? Math.max(0, Math.floor(Number(maxGoals))) : PATH_MAX_GOALS;
  const tries = Math.min(cap, goals.length);
  for (let i = 0; i < tries; i++) {
    const points = asWalk(plan(start, goals[i]), start);
    if (points) return { points, goal: goals[i] };
  }
  return null;
}

/** Where the walk is now: given the path and the cursor index, answer the point to steer at and
 *  the new cursor. A waypoint within `reach` is behind us; the path is done when the last one is.
 *  Answers { index, done, target }. Never moves the cursor backwards.
 *
 *  FORWARD ONLY is the whole of it: a body shoved back by a foe, dropped by a stair or knocked off the
 *  route re-aims at the waypoint AHEAD and not the one behind it - the same law as the track's own
 *  steerer, and what keeps a dungeon walk a walk instead of an oscillation in a doorway. */
export function advancePath(path, cursor, at, reach = PATH_REACH_M) {
  if (!Array.isArray(path) || !path.length) return { index: 0, done: true, target: null };
  const near = Number.isFinite(Number(reach)) ? Math.max(0, Number(reach)) : PATH_REACH_M;
  const from = Math.max(0, Math.floor(Number(cursor) || 0));
  for (let i = from; i < path.length; i++) {
    if (distanceTo(at, path[i]) > near) return { index: i, done: false, target: path[i] };
  }
  return { index: Math.max(from, path.length), done: true, target: null };
}

/** The distance actually walked along a path from `at`'s nearest projection to its end - the number
 *  a leg reports so "the walk went somewhere" is measured, not assumed.
 *
 *  The body is PROJECTED onto the path and not merely joined to its nearest waypoint: a bot standing
 *  beside the second leg of an L-shaped corridor owes the metres to the corner as well as the run
 *  after it, and a leg that reported only the waypoints would read short on exactly the corner a
 *  dungeon is made of. A body past the end owes the walk back to it, and a one-point path is a place
 *  with no distance along it. */
export function pathLengthFrom(path, at) {
  if (!Array.isArray(path)) return 0;
  const legs = [];
  for (let i = 1; i < path.length; i++) {
    const a = pointOf(path[i - 1]), b = pointOf(path[i]);
    if (!a || !b) return 0;   // a path with a hole in it is not a path, and no number is honest about it
    legs.push([a, b]);
  }
  const total = legs.reduce((sum, [a, b]) => sum + distanceTo(a, b), 0);
  const body = pointOf(at);
  if (!body || !legs.length) return total;
  let best = Infinity, bestLeg = 0, bestT = 0;
  for (let i = 0; i < legs.length; i++) {
    const [a, b] = legs[i];
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((body[0] - a[0]) * dx + (body[2] - a[2]) * dz) / len2)) : 0;
    const d = Math.hypot(body[0] - (a[0] + dx * t), body[2] - (a[2] + dz * t));
    if (d < best) { best = d; bestLeg = i; bestT = t; }
  }
  let sum = best;   // the metres from where the body stands to the path itself
  for (let i = bestLeg; i < legs.length; i++) {
    const leg = distanceTo(legs[i][0], legs[i][1]);
    sum += i === bestLeg ? leg * (1 - bestT) : leg;
  }
  return sum;
}
