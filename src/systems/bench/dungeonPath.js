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
// SO WHAT IS LEFT HERE IS THE COARSE PART, the part a bot steering a CAMERA owes a corridor: WHICH
// PLACES are even candidates (the dungeon's own floor, one centre per navmesh polygon - `walkGoals`;
// the foes are only the fallback, because a walk offered nothing but the two rats the fight legs left
// standing walks to them and back and never crosses the dungeon), which of them can be reached at all
// (a room in an unreachable part is a leg spent staring at a wall, and it must say so as a null rather
// than as twenty seconds of standing still), which waypoint is next within a reach wider than the
// engine's own 0.45 m - the bench steers a look and not a capsule, and a camera's idea of "arrived" is
// a metre rather than a body's width - and how far the walk actually went, so "the walk went
// somewhere" is a number in the report rather than an argument from the screenshots.
//
// Pure: the query is a parameter, the body is `at`, and nothing here owns a clock. The same code is
// tested on a fake dungeon in test/systems/bench/dungeonPath.test.js and plans the real one in the page.

import { distanceTo } from './track.js';
import { polyHeight } from '../../ai/nav/navmesh.js';   // the mesh's OWN height layer: a place's y is the floor there, on that polygon's level

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

/** How many of a walk's questions are kept for FOES. The dungeon's floor is what the walk crosses, but
 *  a page whose mesh cannot join its own centre to anywhere still has the foes the fight legs left
 *  standing: a leg that asked only the floor would report "no route to walk" over a room it could
 *  cross. Two is a fallback, not a plan. */
export const PATH_FOE_GOALS = 2;

/** THE WALKABLE FLOOR AS PLACES: one point per polygon of the dungeon's own baked navmesh - its
 *  centre, in world [x, y, z], with the height the agent rides there (navmesh.js `polyHeight`, on that
 *  polygon's own level, so a stacked dungeon's upper floor is not answered with the tallest top under
 *  it - `findPath` picks each endpoint's LEVEL from its y).
 *
 *  `chf` is the bake the dungeon's own foes path over (`EnhancedEnemyAI`'s `nav()`), and this reads it
 *  the way the bake wrote it: `mesh.verts` are in GRID units (cells, relative to the mesh's origin),
 *  so a centre is `xmin + x * cs` in the world - the conversion `solvePath` itself uses.
 *
 *  A query about STANDING, not a second path-finder: the polys are the floor the bake has already
 *  called walkable and joined, so a body standing on one of these centres is standing on floor the
 *  engine can locate, and a route to it is the engine's own `findPath`. Nothing here chooses a route;
 *  `walkGoals` chooses which of these places to ASK about. A page whose bake has not landed, or a
 *  polygon naming a vertex the mesh has not got, is skipped - a mesh with no places answers [], which
 *  is the truth and not an error.
 * @param {any} chf the compact heightfield the bake left (`{ cs, xmin, zmin, mesh: { verts, polys } }`)
 * @returns {Array<number[]>} one [x, y, z] a polygon
 */
export function navSites(chf) {
  const mesh = chf?.mesh;
  if (!mesh || !Array.isArray(mesh.polys) || !mesh.polys.length) return [];
  const { cs, xmin, zmin } = chf;
  const out = [];
  for (let pi = 0; pi < mesh.polys.length; pi++) {
    const verts = mesh.polys[pi]?.verts;
    if (!Array.isArray(verts) || !verts.length) continue;
    let gx = 0, gz = 0;
    for (const gi of verts) { const v = mesh.verts[gi]; gx += v?.x ?? NaN; gz += v?.z ?? NaN; }
    if (!Number.isFinite(gx) || !Number.isFinite(gz)) continue;   // a vertex the mesh has not got: no place
    const wx = xmin + (gx / verts.length) * cs, wz = zmin + (gz / verts.length) * cs;
    out.push([wx, polyHeight(chf, pi, wx, wz) ?? 0, wz]);
  }
  return out;
}

/**
 * THE DESTINATIONS A DUNGEON WALK ASKS THE ENGINE ABOUT, best first.
 *
 * A dungeon walk used to be offered only the foes: it walked to the two rats the fight legs left
 * standing, turned round and walked back - "in the dungeon the guy isn't going through the dungeon"
 * (the owner). The thing to cross is the dungeon, and the mesh already holds it: `sites` are the
 * floor's own centres (one per polygon, this module's `navSites`). So the floor's places are the
 * walk's destinations and the foes are its fallback.
 *
 * FARTHEST FIRST, SPREAD ACROSS THE RANGE: the places are sorted by distance and sampled with a
 * stride, so the leg's handful of questions cover the whole dungeon instead of the handful of rooms
 * round the body. The farthest one the engine can reach is the one walked to (`pickWalk` takes the
 * first that answers) - a route across the floor - and when the far end is a floor the mesh cannot
 * join, the questions come back down the range rather than giving up.
 *
 * AND NOTHING THIS LEG HAS ALREADY WALKED TO: a place within `visitedM` of one in `seen` is dropped,
 * so the walk crosses the dungeon room by room instead of returning to the room it started in.
 * `seen` is the caller's memory; this function only reads it. `visitedM` of 0 means no memory.
 *
 * @param {{ sites?: Array<number[]>, foes?: Array<number[]>, seen?: Array<number[]>, from: number[],
 *           maxGoals?: number, visitedM?: number, minStepM?: number }} q
 * @returns {Array<number[]>} the goals, in the order the engine is asked for them
 */
export function walkGoals({ sites = [], foes = [], seen = [], from, maxGoals = PATH_MAX_GOALS, visitedM = 0, minStepM = PATH_MIN_STEP_M } = {}) {
  const start = pointOf(from);
  if (!start) return [];
  const cap = Number.isFinite(Number(maxGoals)) ? Math.max(0, Math.floor(Number(maxGoals))) : PATH_MAX_GOALS;
  if (!cap) return [];
  const visited = Array.isArray(seen) ? seen : [];
  const usable = (p) => {
    const q = pointOf(p);
    if (!q) return null;
    if (!(distanceTo(start, q) >= minStepM)) return null;   // at the body's own feet: a turn, not a walk
    if (visitedM > 0 && visited.some((v) => distanceTo(v, q) <= visitedM)) return null;   // already walked to
    return q;
  };
  /** The usable points, farthest from the body first - the far end of the dungeon is the walk. */
  const farFirst = (list) => (Array.isArray(list) ? list : []).map(usable).filter(Boolean)
    .sort((a, b) => distanceTo(start, b) - distanceTo(start, a));
  const places = farFirst(sites);
  const foeGoals = farFirst(foes);
  // THE FOES KEEP THEIR QUESTIONS even when the floor offers more places than a leg may ask about.
  const siteCap = Math.max(0, cap - Math.min(PATH_FOE_GOALS, foeGoals.length));
  const stride = Math.max(1, Math.ceil(places.length / Math.max(1, siteCap)));
  const goals = [];
  for (let i = 0; i < places.length && goals.length < siteCap; i += stride) goals.push(places[i]);
  for (const g of foeGoals) { if (goals.length >= cap) break; goals.push(g); }
  return goals;
}

/** Where the walk is now: given the path and the cursor index, answer the point to steer at and
 *  the new cursor. A waypoint within `reach` is behind us; the path is done when the last one is.
 *  Answers { index, done, target }. Never moves the cursor backwards.
 *
 *  FORWARD ONLY is the whole of it: a body shoved back by a foe, dropped by a stair or knocked off the
 *  route re-aims at the waypoint AHEAD and not the one behind it - the same law as the track's own
 *  steerer, and what keeps a dungeon walk a walk instead of an oscillation in a doorway.
 *
 *  AND A WAYPOINT THE BODY HAS ALREADY GOT PAST IS BEHIND IT, whatever the reach says. A camera
 *  reaches 0.6 m; a body at a run covers more than that between two frames of the machine this
 *  benchmark exists to measure, so "within the reach" alone reads a passed corner as one still
 *  ahead and the walk turns round in the corridor. Nearer the NEXT waypoint than this one is the
 *  same law at a slower clock: the point is behind, steer at the next. */
export function advancePath(path, cursor, at, reach = PATH_REACH_M) {
  if (!Array.isArray(path) || !path.length) return { index: 0, done: true, target: null };
  const near = Number.isFinite(Number(reach)) ? Math.max(0, Number(reach)) : PATH_REACH_M;
  const from = Math.max(0, Math.floor(Number(cursor) || 0));
  for (let i = from; i < path.length; i++) {
    const distance = distanceTo(at, path[i]);
    if (distance <= near) continue;
    const next = path[i + 1];
    if (next && distanceTo(at, next) < distance) continue;   // passed between two frames: it is behind
    return { index: i, done: false, target: path[i] };
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
