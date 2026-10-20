// BENCH1 - THE BENCHMARK'S TRACKS (2026-10-19). A benchmark's city leg is a
// WALK, and a walk nobody drives is a bot standing in a wall: the numbers
// that follow are the frame time of a character pressing its nose into a
// door. So the route is DATA - a list of waypoints through the streets,
// authored once by tools/benchTracks.mjs and reviewed as a strip of
// screenshots - and this module is the only arithmetic between that list
// and the game's own input: which waypoint is next, how far the character
// has to turn to face it, and whether it has arrived.
//
// THE MOTOR IS THE GAME'S. Nothing here moves a body: it says "forward, and
// the look turns by this many radians", and systems/bench/bot.js presses the
// player's own bound keys with it. So the collider, the stairs, the crowd
// that gets in the way and the encounters are the real ones - which is the
// whole point of measuring this game and not a harness.
//
// YAW IS THE CAMERA'S. Every host reads the look as [sin(yaw), cos(yaw)]
// (world.js:"noteLocalPlayer(walkMode && playerSpawned ? player.pos : cam.pos, fwd)"),
// so the bearing to a point is atan2(dx, dz), and what the bot owes the look
// is that bearing less the heading it already has, wrapped to (-PI, PI].
// Everything here is horizontal: a waypoint on a stair's landing is reached
// by walking to its metre, not by falling onto its y.
//
// Pure: no clock, no body, no host. The tick's `dt` is the caller's.

/** How near a waypoint counts as arrived, in metres - wider than the capsule so a corner can be cut. */
export const REACH_M = 2.5;
/** The longest straight run a track may ask for: a corner cannot be steered inside a segment this long. */
export const MAX_SEGMENT_M = 40;
/** How fast the look may be turned, radians a second. A rate and not a per-frame step, so a slow frame
 *  turns as far as a fast one - a per-frame cap would make the bot's turning depend on the frame rate the
 *  benchmark is trying to measure. */
export const TURN_RATE_RAD_S = 3;
/** Past this bearing the bot stands and turns instead of walking a circle into whatever is beside it. */
export const WALK_WITHIN_RAD = 1.9;
/** Two waypoints closer than this are one waypoint (a station: the character stands and the crowd is the load). */
export const MIN_SEGMENT_M = 0.25;

/** The horizontal distance between two points, in metres. The y is the stairs': ignored. */
export function distanceTo(at, target) {
  const dx = (target?.[0] ?? target?.x ?? NaN) - (at?.[0] ?? at?.x ?? NaN);
  const dz = (target?.[2] ?? target?.z ?? NaN) - (at?.[2] ?? at?.z ?? NaN);
  return Math.hypot(dx, dz);
}

/** The bearing to a point in the camera's yaw, radians: atan2(dx, dz), the hosts' own reading of a look. */
export function bearingTo(at, target) {
  const dx = (target?.[0] ?? target?.x ?? NaN) - (at?.[0] ?? at?.x ?? NaN);
  const dz = (target?.[2] ?? target?.z ?? NaN) - (at?.[2] ?? at?.z ?? NaN);
  return Math.atan2(dx, dz);
}

/** An angle wrapped to (-PI, PI] - the shortest way round, which is the way a look turns. */
export function wrapAngle(a) {
  if (!Number.isFinite(a)) return 0;
  const twoPi = Math.PI * 2;
  let w = a % twoPi;
  if (w <= -Math.PI) w += twoPi;
  else if (w > Math.PI) w -= twoPi;
  return w;
}

/** A track's whole run, in metres - what the run reports as "distance walked", so a bot that stopped
 *  after one step is visible as a number and not only as a screenshot. */
export function trackLength(track) {
  if (!Array.isArray(track)) return 0;
  let sum = 0;
  for (let i = 1; i < track.length; i++) sum += distanceTo(track[i - 1], track[i]);
  return sum;
}

/**
 * The waypoint to walk at: the first one from the caller's cursor that is still further than REACH_M.
 * THE CURSOR ONLY MOVES FORWARD. A character shoved back by the crowd, dropped by a stair or knocked off
 * the route re-aims at the waypoint AHEAD and not the one behind it, which is what keeps a walk a walk
 * instead of an oscillation between two points it can no longer reach in a straight line.
 * @param {Array<number[]|{x:number,z:number}>} track
 * @param {number[]} at the character's feet
 * @param {number} [from] the caller's cursor - never searched below it
 * @returns {{ index: number, target: any, done: boolean }} `index` is the cursor to keep; `done` means
 *   every waypoint from it is reached, and `target` is null.
 */
export function nextWaypoint(track, at, from = 0) {
  if (!Array.isArray(track) || !track.length) return { index: 0, target: null, done: true };
  for (let i = Math.max(0, from | 0); i < track.length; i++) {
    if (distanceTo(at, track[i]) > REACH_M) return { index: i, target: track[i], done: false };
  }
  return { index: track.length, target: null, done: true };
}

/**
 * One tick's intent, from where the character stands to the waypoint it is walking at.
 * @param {{ at:number[], heading:number, target:any, dt:number, withinRad?:number, reach?:number }} q
 *   `heading` is the camera yaw, `dt` seconds; `withinRad` is how far off the bearing the bot will
 *   still walk - a street can be crossed at any angle (`WALK_WITHIN_RAD`), a dungeon corridor cannot,
 *   so the dungeon walk hands in a tighter gate and the body turns on the spot before it walks into
 *   the jamb; `reach` is how near the waypoint counts as arrived - the track's own `REACH_M` by
 *   default, and the dungeon walk hands in ITS waypoint reach, because a steerer that stands two and
 *   a half metres short of a corner the walk is still steering at never arrives at anything.
 * @returns {{ forward:boolean, lookDelta:number, reached:boolean, distance:number, bearing:number }}
 */
export function steerTo({ at, heading, target, dt = 1 / 60, withinRad = WALK_WITHIN_RAD, reach = REACH_M }) {
  const distance = distanceTo(at, target);
  const bearing = bearingTo(at, target);
  const near = Number.isFinite(reach) ? Math.max(0, reach) : REACH_M;
  const reached = !(distance > 0) || distance <= near;
  const step = Math.max(0, Number(dt) || 0) * TURN_RATE_RAD_S;
  const lookDelta = reached ? 0 : Math.max(-step, Math.min(step, wrapAngle(bearing - heading)));
  const gate = Number.isFinite(withinRad) ? Math.max(0, withinRad) : WALK_WITHIN_RAD;
  return { forward: !reached && Math.abs(wrapAngle(bearing - heading)) <= gate, lookDelta, reached, distance, bearing };
}

/**
 * Is this a track the bot can walk? Checked by the author (tools/benchTracks.mjs) before a track is
 * written and by the leg before it runs: a bad track is a leg that measures nothing, and it must say so
 * at the door rather than after twenty seconds of standing still.
 * @param {Array} track
 * @returns {{ ok:boolean, why:string }}
 */
export function validateTrack(track) {
  if (!Array.isArray(track) || track.length < 2) return { ok: false, why: 'a track is at least two waypoints - one point is a place, not a walk' };
  const xz = (p) => {
    const x = p?.[0] ?? p?.x;
    const z = p?.[2] ?? p?.z;
    return Number.isFinite(x) && Number.isFinite(z) ? [x, z] : null;
  };
  for (let i = 0; i < track.length; i++) {
    if (!xz(track[i])) return { ok: false, why: `waypoint ${i} is not a finite x/z: ${JSON.stringify(track[i])}` };
    if (i === 0) continue;
    const a = xz(track[i - 1]);
    const b = xz(track[i]);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!(d >= MIN_SEGMENT_M)) return { ok: false, why: `waypoints ${i - 1} and ${i} are the same point (${d.toFixed(2)} m) - a station is one waypoint, walked once` };
    if (d > MAX_SEGMENT_M) return { ok: false, why: `waypoints ${i - 1} and ${i} are ${d.toFixed(1)} m apart, past the ${MAX_SEGMENT_M} m a corner can be steered inside` };
  }
  return { ok: true, why: `${track.length} waypoints, ${trackLength(track).toFixed(1)} m` };
}
