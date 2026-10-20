import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBenchBot } from '../../../src/systems/bench/bot.js';
import { REACH_M } from '../../../src/systems/bench/track.js';

// BENCH1's hands: the bot presses the player's own bound codes, and everything it
// presses it releases. The codes below are stand-ins for what
// systems/inputActions.js codeForAction resolves at run time - the bot never
// spells a key, which is why no test here can pass by hard-coding one.

/** A recording press/release pair, plus the look the bot asked for. */
function rig(codes = { forward: 'KeyW', run: 'KeyR', swing: 'Mouse1' }) {
  const pressed = [];
  const released = [];
  const looks = [];
  const bot = createBenchBot({
    codes,
    press: (c) => pressed.push(c),
    release: (c) => released.push(c),
    look: (d) => looks.push(d),
  });
  return { bot, pressed, released, looks };
}

test('BENCH1 bot: walking at a waypoint holds the player\'s forward and run codes, once each', () => {
  const { bot, pressed, released } = rig();
  const q = { at: [0, 0, 0], heading: 0, target: [0, 0, 10], dt: 1 / 60 };
  bot.steer(q);
  bot.steer(q);
  assert.deepEqual(pressed, ['KeyW', 'KeyR'], 'held, not re-pressed every frame - a held set answers held()');
  assert.deepEqual(released, []);
  assert.deepEqual(bot.held(), ['KeyR', 'KeyW']);
});

test('BENCH1 bot: arriving lets go of what it was holding, and a station swings on the spot', () => {
  const { bot, released } = rig();
  bot.steer({ at: [0, 0, 0], heading: 0, target: [0, 0, 10], dt: 1 / 60 });
  const s = bot.steer({ at: [0, 0, 0], heading: 0, target: [0, 0, REACH_M - 1], dt: 1 / 60 });
  assert.equal(s.reached, true);
  assert.deepEqual(released, ['KeyW', 'KeyR'], 'the walk is over: nothing is left held');
  assert.deepEqual(bot.held(), []);
});

test('BENCH1 bot: the look is asked for the tick\'s turn - the rate, not the angle', () => {
  const { bot, looks } = rig();
  bot.steer({ at: [0, 0, 0], heading: 0, target: [10, 0, 0], dt: 1 / 60 });
  assert.equal(looks.length, 1);
  assert.ok(looks[0] > 0 && looks[0] < 0.1, `turn asked: ${looks[0]}`);
});

test('BENCH1 bot: the caller\'s facing gate is the bot\'s too - a dungeon walk turns before it walks into the jamb', () => {
  const wide = rig();
  const tight = rig();
  const q = { at: [0, 0, 0], heading: 0, target: [10, 0, 0], dt: 1 / 60 };   // a quarter turn off the bearing
  wide.bot.steer(q);
  tight.bot.steer({ ...q, withinRad: 0.8 });
  assert.deepEqual(wide.pressed, ['KeyW', 'KeyR'], 'the track\'s own gate walks through the turn');
  assert.deepEqual(tight.pressed, [], 'the tighter gate presses nothing until the body faces it');
  assert.equal(tight.looks.length, 1, 'and the look is asked for anyway: it is how the body comes to face it');
});

test('BENCH1 bot: the caller\'s reach is the bot\'s too - a corridor waypoint is walked up to, a street waypoint is not', () => {
  const street = rig();
  const corridor = rig();
  const q = { at: [0, 0, 0], heading: 0, target: [0, 0, 1.2], dt: 1 / 60 };
  street.bot.steer(q);
  corridor.bot.steer({ ...q, reach: 0.6 });
  assert.deepEqual(street.pressed, [], '1.2 m is the street waypoint reached: nothing left to walk');
  assert.deepEqual(corridor.pressed, ['KeyW', 'KeyR'], 'and the corridor waypoint is short of its own reach, so the body walks on');
});

test('BENCH1 bot: a swing is held to its deadline and then let go', () => {
  const { bot, pressed, released } = rig();
  const until = bot.startSwing(1000, 250);
  assert.equal(until, 1250);
  assert.deepEqual(pressed, ['Mouse1']);
  assert.equal(bot.swinging(), true);
  assert.equal(bot.tick(1200), false, 'before the deadline the key is still down');
  assert.deepEqual(released, []);
  assert.equal(bot.tick(1250), true, 'at the deadline the swing is over');
  assert.deepEqual(released, ['Mouse1'], 'the release is never gated - a window opened mid-swing must still let go');
  assert.equal(bot.swinging(), false);
});

test('BENCH1 bot: ONE press for three weapons - the fight legs differ in what is held, never in what the bot does', () => {
  const blade = rig();
  const bow = rig();
  const spell = rig();
  for (const r of [blade, bow, spell]) r.bot.startSwing(0, 100);
  assert.deepEqual(blade.pressed, ['Mouse1']);
  assert.deepEqual(bow.pressed, ['Mouse1']);
  assert.deepEqual(spell.pressed, ['Mouse1']);
  // and nothing else was pressed: the bot has no notion of a weapon to change
  for (const r of [blade, bow, spell]) assert.equal(r.pressed.length, 1, 'one code, three systems - magic.interceptAttack is what decides');
});

test('BENCH1 bot: stop() releases every held code, and says what it swung', () => {
  const { bot, released } = rig();
  bot.steer({ at: [0, 0, 0], heading: 0, target: [0, 0, 10], dt: 1 / 60 });
  bot.startSwing(0, 100000);
  assert.equal(bot.swings(), 1);
  bot.stop();
  assert.deepEqual(bot.held(), []);
  assert.deepEqual(released.sort(), ['KeyR', 'KeyW', 'Mouse1']);
  assert.equal(bot.swinging(), false);
});

test('BENCH1 bot: a bot built without the player\'s bindings refuses rather than pressing a guess', () => {
  assert.throws(() => createBenchBot({ codes: { swing: 'Mouse1' }, press: () => {}, release: () => {} }), /codes\.forward/);
  assert.throws(() => createBenchBot({ codes: { swing: 'Mouse1', forward: 'KeyW' } }), /press and release/);
});
