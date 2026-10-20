// BENCH1 - A STREET ROUTE, PLANNED IN THE GAME (2026-10-19). The street leg replays a route, and a
// route used to be authored by a separate tool on a machine with the data (`tools/benchTracks.mjs`) -
// which meant the one leg a person most wants to watch was the one leg that could not run on a fresh
// checkout. The game already knows where its streets ARE: every town carries a `CityNavigation` grid
// of walkable cells, with the weights DFU gives a pedestrian and `getRandomSpawnPosition`, the
// function the town's own population uses to place a walker. So the route is PLANNED HERE, at run
// time, off that grid: waypoints that a townsman could stand on, no further apart than the steerer
// can follow, out from the town's centre.
//
// Pure: the nav grid and the ground height are handed in, so this is tested on a fake town in
// test/systems/bench/route.test.js and the same code plans the capital's route in the browser.

/** How far apart two waypoints may be, metres - the steerer's own limit (`track.js` MAX_SEGMENT_M)
 *  with room to spare, because a walk re-aims at each point rather than flying to it. */
export const ROUTE_STEP_M = 26;
/** How many waypoints a route holds: at ~25 m a step that is a run of around half a kilometre. */
export const ROUTE_POINTS = 16;
/** The radius, in nav cells, the game's own walker spawn is asked for (TownPopulation's own 64 at the
 *  radius it uses; ours is the step, so the next waypoint is inside a corner's walk). */
export const ROUTE_CELL_RADIUS = 16;

/**
 * A seeded uniform (mulberry32) - so the route a run walks is the route the last run walked. A
 * benchmark's street has to be the SAME street twice, or two runs on one machine measure two
 * different half-kilometres and neither can be compared with the other. Pure; `rand` is all
 * `planRoute` needs from it.
 * @param {number} seed
 * @returns {() => number}
 */
export function seededRandom(seed = 1) {
  let a = (Number(seed) || 0) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The nearest nav cell a walker could stand on, as [gx, gy], or null - the ring search a snapped
 * point needs. A town's middle is the mean of its buildings, and the mean of a town's buildings is
 * regularly the inside of a block; a benchmark cannot put a body there. Pure.
 * @param {{ weightAt:(gx:number,gy:number)=>number, worldToNav:(x:number,z:number)=>number[] }} nav
 * @param {number} lx @param {number} lz the point, in the grid's own local space
 * @param {number} [cells] how far out the search may go, in cells
 * @returns {number[] | null}
 */
export function snapToWalkable(nav, lx, lz, cells = ROUTE_CELL_RADIUS) {
  if (!nav || !Number.isFinite(lx) || !Number.isFinite(lz)) return null;
  const [cx, cy] = nav.worldToNav(lx, lz);
  if (nav.weightAt(cx, cy) > 0) return [cx, cy];
  for (let r = 1; r <= cells; r++) {
    let best = null, bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;   // the ring only, never the square again
        if (nav.weightAt(cx + dx, cy + dy) <= 0) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = [cx + dx, cy + dy]; }
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Plan a walkable route out from a point, off the town's own navigation grid.
 * @param {{
 *   nav: { worldToNav:(x:number,z:number)=>number[], navToWorld:(gx:number,gy:number)=>number[],
 *          weightAt:(gx:number,gy:number)=>number, inBounds:(gx:number,gy:number)=>boolean },
 *   start: number[],                     the town's centre, in the same local space the nav speaks
 *   steps?: number, maxStepM?: number, radius?: number,
 *   rand?: () => number,                 injectable, so a test's route is the test's route
 *   heightAt?: ((x:number, z:number) => number) | null,   the ground under a point, for the y
 * }} opts
 * @returns {number[][]} the waypoints as [x, y, z], the start first; empty when the town offers none
 */
export function planRoute({ nav, start, steps = ROUTE_POINTS, maxStepM = ROUTE_STEP_M, radius = ROUTE_CELL_RADIUS, rand = Math.random, heightAt = null } = {}) {
  if (!nav || !Array.isArray(start) || !Number.isFinite(start[0]) || !Number.isFinite(start[2])) return [];
  const ground = (x, z) => (heightAt ? heightAt(x, z) : 0);
  const out = [[start[0], ground(start[0], start[2]), start[2]]];
  let [gx, gy] = nav.worldToNav(start[0], start[2]);
  const at = (gx2, gy2) => {
    const [lx, lz] = nav.navToWorld(gx2, gy2);
    return [lx, ground(lx, lz), lz];
  };
  for (let i = 0; i < steps; i++) {
    const last = out[out.length - 1];
    // the game's own walker placement, from the last waypoint's cell: a random walkable cell within
    // the radius, up to its own ten attempts. A town whose grid refuses answers null, and the route
    // is what it has - a leg with two points is still a walk, and `validateTrack` says so.
    const spawn = nav.getRandomSpawnPosition(gx, gy, radius, 10, rand);
    if (!spawn) break;
    const [nextX, , nextZ] = at(spawn[0], spawn[1]);
    if (Math.hypot(nextX - last[0], nextZ - last[2]) > maxStepM) continue;   // too far to follow: ask again
    if (Math.hypot(nextX - last[0], nextZ - last[2]) < 2) continue;          // the same step twice: ask again
    out.push([nextX, ground(nextX, nextZ), nextZ]);
    [gx, gy] = spawn;
  }
  return out;
}
