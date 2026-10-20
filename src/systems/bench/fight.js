// BENCH1 - THE HANDS THAT FIGHT (2026-10-19). A fight leg swings at whatever the dungeon put in
// front of the character, and a leg that swings at nothing measures the corridor: the frame times
// it reports are a weapon's own only while a foe is inside them. So the arithmetic that picks the
// foe, stands the bot at it and turns the look onto it lives HERE, as pure functions - the caller
// is a scene host that owns the frame, and a host may not carry this kind of detail (HOST-SPLIT).
//
// THE FOE RECORD CARRIES NO POSITION OF ITS OWN. A dungeon foe in `src/scenes/dungeonContext.js`
// has no x, no y and no `pos`: its floor is `foe.ai.feet`, an [x, y, z] in world metres, and its
// body is `foe.entity.health` / `foe.entity.maxHealth`. It is dead when `foe.dead` is true, and it
// stays in the floor's list afterwards - so "every foe" and "every foe that can be hit" are two
// different lists, and the second one is what every function here answers. The point a melee blow
// is measured to is the mid-capsule, its feet raised by half its own `ai.height`. Nothing here
// invents a field the engine does not write: the test builds records in exactly that shape.
//
// A BLOW LANDS ON THREE CONDITIONS, and this module serves all three. The distance from the
// player's EYE to that mid-capsule must be within WEAPON_REACH (2.5 m); the foe must lie inside
// the view box; and the line of sight must be clear. The first is why the bot stands
// FOE_STANDOFF_M from the FEET rather than at them - the reach is measured to a centre around
// 0.9 m above the floor, so a body standing on the foe's own feet measures the height it forgot
// and lands short. The second is why the look is turned with the codebase's own bearing,
// atan2(dx, dz) - the reading every host gives a yaw - so the bot faces its foe the way a player
// does, and the view box agrees.
//
// THE RING IS THE CLASSIC BAND. A classic enemy notices a player within 25.6 m horizontally and
// 3.2 m vertically, or by line of sight; those are the band's own numbers, and they are the ring a
// fight leg may pick a foe from - a bot that went looking past them would walk half the dungeon
// before the frame it was supposed to measure. `foesInBand` is that ring, nearest first.
//
// Pure: no engine, no window, no clock, no dice. A dungeon's own frame supplies the list and the
// player's place, and `test/systems/bench/fight.test.js` supplies both again as fixtures.

import { bearingTo, distanceTo } from './track.js';

/** Where the bot stands to swing, in metres from the foe's FEET. The reach is 2.5 m and it is
 *  measured from the player's eye (about 1.6 m up) to the mid-capsule (half of a 1.8 m capsule,
 *  so 0.9 m up): at this standoff the height between them is 0.7 m and the blow is measured at
 *  about 1.75 m, inside the reach with room for the drift of one frame. Standing at the feet
 *  themselves spends the whole reach on that 0.7 m and misses. */
export const FOE_STANDOFF_M = 1.6;

/** The classic spawn band's vertical half-height, in metres: an enemy notices a player within
 *  3.2 m of its own floor, so a foe on the storey above is not a foe this leg may fight. */
export const FOE_BAND_DY_M = 3.2;

/** The classic spawn band's horizontal reach, in metres: 25.6 m is where a classic enemy starts to
 *  notice, and it is the widest ring a fight leg may pick its foe from. */
export const FOE_BAND_XZ_M = 25.6;

/** The capsule height a foe with no `ai.height` of its own is given - Daggerfall's humanoid
 *  enemy, the body every dungeon record is built around. */
const DEFAULT_FOE_HEIGHT_M = 1.8;

/**
 * A point as [x, y, z], or null when the value carries no finite x and z. Arrays and the
 * codebase's own `{ x, y, z }` markers both count; a missing y reads as 0, which is the floor
 * this leg walks on and the only height a bearing never uses.
 * @param {any} p
 * @returns {number[] | null}
 */
function asPoint(p) {
  if (!p) return null;
  const x = Array.isArray(p) ? p[0] : p.x;
  const y = Array.isArray(p) ? p[1] : p.y;
  const z = Array.isArray(p) ? p[2] : p.z;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return [x, Number.isFinite(y) ? y : 0, z];
}

/**
 * A foe's floor position as [x, y, z], or null when the record carries none. `ai.feet` first -
 * that is where the engine writes a dungeon foe - then a `pos`, then a bare point, so a fixture
 * and a stray marker are read rather than refused.
 * @param {any} foe
 * @returns {number[] | null}
 */
export function foeFeet(foe) {
  return asPoint(foe?.ai?.feet) ?? asPoint(foe?.pos) ?? (Array.isArray(foe) ? asPoint(foe) : null);
}

/**
 * The live foes that carry a position - the only list a fight leg may aim at. A dead foe keeps its
 * place in the floor's list while its corpse is drawn, and a record with no feet is not somewhere a
 * blow can be measured to; both are dropped here rather than by each caller.
 * @param {Array<any>} foes
 * @returns {Array<any>}
 */
export function liveFoes(foes) {
  if (!Array.isArray(foes)) return [];
  return foes.filter((foe) => !!foe && !foe.dead && foeFeet(foe) !== null);
}

/**
 * The mid-capsule point a blow is measured to: the foe's feet raised by half its own height. A
 * short body (a rat, a bat) is a smaller target, and its own `ai.height` is the number the engine
 * itself gives a missile and a blood mark.
 * @param {any} foe
 * @returns {number[] | null} null when the record carries no floor
 */
export function foeCentre(foe) {
  const feet = foeFeet(foe);
  if (!feet) return null;
  const height = Number.isFinite(foe?.ai?.height) && foe.ai.height > 0 ? foe.ai.height : DEFAULT_FOE_HEIGHT_M;
  return [feet[0], feet[1] + height / 2, feet[2]];
}

/**
 * The nearest live foe to `at` within `reach` metres, measured horizontally over the floor - the
 * foe a swing should be aimed at, and the one the bot then walks to.
 * @param {Array<any>} foes
 * @param {number[]} at the player's feet
 * @param {number} [reach] the band's own 25.6 m unless the leg asks for a tighter ring
 * @returns {any | null}
 */
export function nearestFoe(foes, at, reach = FOE_BAND_XZ_M) {
  const here = asPoint(at);
  if (!here) return null;
  const limit = Number.isFinite(reach) ? reach : FOE_BAND_XZ_M;
  let best = null;
  let bestD = Infinity;
  for (const foe of liveFoes(foes)) {
    const d = distanceTo(here, foeFeet(foe));
    if (d <= limit && d < bestD) { bestD = d; best = foe; }
  }
  return best;
}

/**
 * Where the bot should stand to hit `foe` from `at`: on the straight line from the foe toward the
 * player, `standoff` metres from the foe's FEET, at the foe's own floor height. The height matters
 * as much as the distance - a body placed at the mid-capsule's y is a body in the air, and the
 * engine's own motor would drop it and measure the fall instead of the swing.
 * A BOT ALREADY INSIDE THE STANDOFF KEEPS ITS PLACE. Answering a spot behind the foe would walk a
 * character that is close enough away from the thing it is already hitting, which is the one way a
 * fight leg can lose its foe without anything dying.
 * @param {any} foe
 * @param {number[]} at the player's feet
 * @param {number} [standoff] FOE_STANDOFF_M unless the leg is testing a reach of its own
 * @returns {number[] | null} null when the foe carries no floor or `at` is not a point
 */
export function standoffSpot(foe, at, standoff = FOE_STANDOFF_M) {
  const feet = foeFeet(foe);
  const here = asPoint(at);
  if (!feet || !here) return null;
  const dx = here[0] - feet[0];
  const dz = here[2] - feet[2];
  const d = Math.hypot(dx, dz);
  const gap = Number.isFinite(standoff) ? standoff : FOE_STANDOFF_M;
  if (!(d >= gap) || !(d > 0)) return [here[0], feet[1], here[2]];   // already nearer than the standoff: its own place
  const k = gap / d;
  return [feet[0] + dx * k, feet[1], feet[2] + dz * k];
}

/**
 * The yaw that faces from `from` to `to` - the codebase's own atan2(dx, dz), the reading every
 * host gives a look (`track.js` `bearingTo`), so a bot facing a foe and a player facing a foe are
 * the same angle and the view box agrees with both.
 * @param {number[]} from the player's eye, or its feet: the bearing is horizontal either way
 * @param {number[]} to the point to face
 * @returns {number | null} null on a point that is not a point, so a caller can say why
 */
export function aimYaw(from, to) {
  const a = asPoint(from);
  const b = asPoint(to);
  if (!a || !b) return null;
  return bearingTo(a, b);
}

/**
 * Every live foe's health, summed - the fight leg's damage proof. A leg reports this before and
 * after its run, and the difference is what the weapon did: a total that did not fall is a leg
 * that swung at air, however good its frame times looked. A dead foe's health is not counted,
 * because a corpse is not damage still to be done; a foe with no floor is not counted either, for
 * the same reason `liveFoes` drops it.
 * @param {Array<any>} foes
 * @returns {number} 0 when there is nothing alive to fight, never NaN
 */
export function foeHealthTotal(foes) {
  let sum = 0;
  for (const foe of liveFoes(foes)) {
    const hp = foe?.entity?.health;
    if (Number.isFinite(hp)) sum += hp;
  }
  return sum;
}

/**
 * Every live foe inside the classic band of `at`, nearest first - the ring a fight leg fights.
 * Both halves of the band are checked: 25.6 m across the floor and 3.2 m up it, so a foe on the
 * storey above is left to the leg that owns that storey. Nearest first because a leg that must
 * choose takes the closest, and because a report reads in the order the bot would act.
 * @param {Array<any>} foes
 * @param {number[]} at the player's feet
 * @returns {Array<any>} the records themselves, sorted by horizontal distance
 */
export function foesInBand(foes, at) {
  const here = asPoint(at);
  if (!here) return [];
  const ring = [];
  for (const foe of liveFoes(foes)) {
    const feet = foeFeet(foe);
    const d = distanceTo(here, feet);
    if (d > FOE_BAND_XZ_M) continue;
    if (Math.abs(feet[1] - here[1]) > FOE_BAND_DY_M) continue;
    ring.push({ foe, d });
  }
  ring.sort((a, b) => a.d - b.d);
  return ring.map((e) => e.foe);
}
