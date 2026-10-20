import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  foeFeet, liveFoes, foeCentre, nearestFoe, standoffSpot, aimYaw, foeHealthTotal, foesInBand,
  FOE_STANDOFF_M, FOE_BAND_DY_M, FOE_BAND_XZ_M,
} from '../../../src/systems/bench/fight.js';

// BENCH1's fight hands: the arithmetic that finds a foe, stands the bot at it and turns the look
// onto it. The records below are shaped exactly as `src/scenes/dungeonContext.js` writes them -
// no x, no y, no `pos`, the floor on `foe.ai.feet` and the body on `foe.entity` - because the whole
// reason this module exists is that a caller cannot guess those fields at the call site.

/** A dungeon foe record, the engine's own shape. */
function foe(x, z, { y = 0, height = 1.8, health = 40, maxHealth = 40, dead = false } = {}) {
  return { ai: { feet: [x, y, z], height }, entity: { health, maxHealth }, dead };
}

test('BENCH1 fight: a foe\'s floor is on its AI, or a pos, or a bare point - and nowhere else', () => {
  assert.deepEqual(foeFeet(foe(3, 4, { y: 7 })), [3, 7, 4], 'ai.feet is where the engine writes a dungeon foe');
  assert.deepEqual(foeFeet({ pos: [4, 5, 6] }), [4, 5, 6], 'a record that carries a pos instead is read');
  assert.deepEqual(foeFeet({ pos: { x: 4, y: 5, z: 6 } }), [4, 5, 6], 'and the codebase\'s own {x,y,z} marker with it');
  assert.deepEqual(foeFeet([7, 8, 9]), [7, 8, 9], 'a bare point is a point');
  assert.deepEqual(foeFeet({ ai: { feet: [7, 8, 9] }, pos: [0, 0, 0] }), [7, 8, 9], 'and the AI wins: it is the field the engine keeps current');
  assert.equal(foeFeet({ ai: {} }), null, 'a foe with no feet is nowhere a blow can be measured');
  assert.equal(foeFeet(null), null, 'and no record at all is not a point either');
  assert.equal(foeFeet({ ai: { feet: [1, 0, NaN] } }), null, 'a floor that is not finite is no floor');
});

test('BENCH1 fight: the mid-capsule is half the foe\'s own height above its floor', () => {
  assert.deepEqual(foeCentre(foe(3, 4, { y: 2 })), [3, 2.9, 4], 'a 1.8 m body is measured to 0.9 m up');
  assert.deepEqual(foeCentre(foe(3, 4, { y: 0, height: 0.4 })), [3, 0.2, 4], 'a rat is a smaller target, on its own height');
  assert.deepEqual(foeCentre({ ai: { feet: [1, 0, 1] } }), [1, 0.9, 1], 'no height of its own: the humanoid capsule');
  assert.equal(foeCentre({ ai: {} }), null, 'no floor, no centre to aim at');
  assert.equal(foeCentre(null), null, 'and no record, no centre');
  assert.deepEqual(foeCentre(foe(3, 4, { y: 2 })), [3, 2 + 1.8 / 2, 4], 'the eye the reach is measured to');
});

test('BENCH1 fight: the live list drops the dead, and the nearest foe is chosen off it', () => {
  const deadClose = foe(1, 0, { dead: true, health: 0 });
  const liveMid = foe(5, 0);
  const liveFar = foe(12, 0);
  const foes = [deadClose, liveMid, liveFar];
  assert.equal(nearestFoe(foes, [0, 0, 0]), liveMid, 'the closer corpse is not a target: the nearest LIVE foe wins');
  assert.deepEqual(liveFoes(foes), [liveMid, liveFar], 'and the list the leg aims at is the two that breathe');
  assert.equal(nearestFoe(foes, [0, 0, 0], 4), null, 'the nearest live foe is 5 m out, past a 4 m ring');
  assert.equal(nearestFoe(foes, [12, 0, 0.5], 1), liveFar, 'a tighter ring still finds the foe inside it');
  assert.equal(nearestFoe(foes, null), null, 'a player with no place has no nearest foe');
  assert.equal(nearestFoe(null, [0, 0, 0]), null, 'and an empty floor answers null, not undefined');
  assert.equal(nearestFoe([{ ai: {}, dead: false }], [0, 0, 0]), null, 'a foe that carries no position is not a target');
});

test('BENCH1 fight: the standoff lands exactly FOE_STANDOFF_M from the foe\'s feet, on the line to the player', () => {
  const f = foe(10, 10, { y: 2 });
  const spot = standoffSpot(f, [10, 2, 16]);
  assert.deepEqual(spot, [10, 2, 10 + FOE_STANDOFF_M], 'straight down the line, at the foe\'s own floor height');
  assert.equal(Math.hypot(spot[0] - 10, spot[2] - 10).toFixed(6), FOE_STANDOFF_M.toFixed(6), 'six decimal places of 1.6');
  assert.equal(spot[1], 2, 'the bot stands on the floor the foe stands on, never at the mid-capsule\'s y');
  // a diagonal approach measures the same, because the spot is on the straight line and not on an axis
  const diag = standoffSpot(f, [13, 9, 14]);
  const d = Math.hypot(diag[0] - 10, diag[2] - 10);
  assert.equal(d.toFixed(6), FOE_STANDOFF_M.toFixed(6), 'the same 1.6 m from a diagonal, at the feet\'s height');
  assert.ok(diag[0] > 10 && diag[2] > 10, 'and it is between the foe and the player, not behind it');
  // already inside the standoff: the bot keeps its own place rather than being walked backwards
  assert.deepEqual(standoffSpot(f, [10, 2, 10.5]), [10, 2, 10.5], 'a bot nearer than the standoff stays put');
  assert.deepEqual(standoffSpot(f, [10, 2, 10]), [10, 2, 10], 'even standing on the foe\'s own feet');
  assert.equal(standoffSpot({ ai: {} }, [0, 0, 0]), null, 'a foe with no floor has no standoff');
  assert.equal(standoffSpot(f, null), null, 'and a player with no place has nowhere to stand');
  // the default is the exported constant, and a leg may ask for a reach of its own
  assert.deepEqual(standoffSpot(f, [10, 2, 16], 3), [10, 2, 13], 'the standoff is the caller\'s number');
  assert.equal(FOE_STANDOFF_M, 1.6, 'the number a dungeon fight leg stands at');
});

test('BENCH1 fight: aimYaw is the codebase\'s atan2(dx, dz), so the bot faces its foe as a player does', () => {
  assert.equal(aimYaw([0, 0, 0], [0, 0, 5]), 0, '+z is yaw 0 - the look a host starts from');
  assert.equal(aimYaw([0, 0, 0], [5, 0, 0]), Math.PI / 2, '+x is a quarter turn, as every host reads it');
  assert.equal(aimYaw([2, 1, -3], [7, 1, 9]), Math.atan2(7 - 2, 9 + 3), 'and atan2(dx, dz) everywhere else');
  assert.equal(aimYaw([0, 0, 0], [1, 0, -1]), Math.atan2(1, -1), '-z is behind: the bearing is three-quarter turn');
  assert.equal(aimYaw([0, 0, 0], [0, 40, 5]), 0, 'the height is not a bearing: a foe above is still straight ahead');
  assert.equal(aimYaw(null, [0, 0, 0]), null, 'a look from nowhere is not an angle');
  assert.equal(aimYaw([0, 0, 0], [NaN, 0, 0]), null, 'and a target that is not a point answers null, not NaN');
});

test('BENCH1 fight: the health total is the damage proof, and it counts the living only', () => {
  const foes = [foe(3, 0, { health: 40 }), foe(8, 0, { health: 12 }), foe(2, 0, { health: 90, dead: true })];
  assert.equal(foeHealthTotal(foes), 52, 'the two live foes, and not the corpse\'s 90');
  assert.equal(foeHealthTotal([]), 0, 'an empty floor is 0 and not NaN');
  assert.equal(foeHealthTotal(null), 0, 'and so is no floor at all');
  assert.equal(foeHealthTotal([foe(1, 0, { health: NaN })]), 0, 'a health that is not a number is not damage');
  assert.equal(foeHealthTotal([foe(1, 0, { health: 40, dead: true })]), 0, 'a dead foe\'s health never counts, even alone');
});

test('BENCH1 fight: the band is the classic ring - 25.6 m across, 3.2 m up - nearest first', () => {
  const foes = [
    foe(8, 0, { health: 30 }),                    // in the ring
    foe(3, 0, { health: 30 }),                    // in the ring, and nearest
    foe(30, 0, { health: 30 }),                   // 30 m out: past the band
    foe(5, 0, { y: 10, health: 30 }),             // a foe on the storey above: past the band's height
    foe(2, 0, { dead: true, health: 0 }),         // the nearest of all, and dead
  ];
  const ring = foesInBand(foes, [0, 0, 0]);
  assert.deepEqual(ring.map((f) => f.ai.feet[0]), [3, 8], 'in the band, nearest first');
  assert.equal(ring.includes(foes[2]), false, 'a foe 30 m away is another leg\'s problem');
  assert.equal(ring.includes(foes[3]), false, 'and so is one 10 m up');
  assert.equal(ring.length, 2, 'two foes in the ring out of five records');
  assert.deepEqual(foesInBand(foes, [0, 0, 0], undefined), ring, 'the default call is the band');
  assert.deepEqual(foesInBand(null, [0, 0, 0]), [], 'no floor, no ring');
  assert.deepEqual(foesInBand(foes, null), [], 'no player, no ring');
  assert.equal(FOE_BAND_XZ_M, 25.6, 'the horizontal reach the classic spawn band notices at');
  assert.equal(FOE_BAND_DY_M, 3.2, 'and its vertical half-height');
});
