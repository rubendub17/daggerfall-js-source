import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REACH_M, MAX_SEGMENT_M, TURN_RATE_RAD_S, WALK_WITHIN_RAD,
  bearingTo, wrapAngle, distanceTo, trackLength, nextWaypoint, steerTo, validateTrack,
} from '../../../src/systems/bench/track.js';

// BENCH1's tracks: the arithmetic between a recorded route and the game's own look.
// The convention under test is the hosts' - a look is [sin(yaw), cos(yaw)] - so
// every bearing here is checked against the yaw that would face it.

test('BENCH1 track: the bearing is the camera yaw that faces the point', () => {
  const at = [0, 0, 0];
  assert.equal(bearingTo(at, [0, 0, 10]), 0, 'straight down +z is yaw 0, the hosts\' own reading');
  assert.equal(bearingTo(at, [10, 0, 0]), Math.PI / 2, '+x is a quarter turn to the right');
  assert.equal(bearingTo(at, [-10, 0, 0]), -Math.PI / 2, '-x is the same turn the other way');
  assert.equal(wrapAngle(bearingTo(at, [0, 0, -10])), Math.PI, '-z is half a turn - and it is PI here, not -PI');
});

test('BENCH1 track: a wrapped angle is the shortest way round, in (-PI, PI]', () => {
  assert.equal(wrapAngle(0), 0);
  assert.equal(wrapAngle(Math.PI), Math.PI, 'PI is kept, not folded to -PI: the interval is half-open on the left');
  assert.equal(wrapAngle(-Math.PI), Math.PI);
  assert.equal(wrapAngle((3 * Math.PI) / 2), -Math.PI / 2, 'three quarters round is a quarter the other way');
  assert.equal(wrapAngle(Math.PI * 2), 0, 'a whole turn is no turn');
  assert.equal(wrapAngle(-Math.PI * 2 - 0.5), -0.5);
  assert.equal(wrapAngle(NaN), 0, 'a NaN heading is not allowed to poison a look');
});

test('BENCH1 track: distance is horizontal, so a stair\'s landing is reached by walking to its metre', () => {
  assert.equal(distanceTo([0, 5, 0], [0, 0, 3]), 3, 'the y is the stairs\', never the walk');
  assert.equal(distanceTo([1, 0, 1], [4, 0, 5]), 5, 'a 3-4-5 in the plane');
});

test('BENCH1 track: steerTo asks for forward only when the waypoint is not behind the shoulder', () => {
  const ahead = steerTo({ at: [0, 0, 0], heading: 0, target: [0, 0, 10], dt: 1 / 60 });
  assert.equal(ahead.forward, true);
  assert.equal(ahead.lookDelta, 0, 'already facing it - the look is not asked to do anything');
  assert.equal(ahead.reached, false);

  const sideways = steerTo({ at: [0, 0, 0], heading: 0, target: [10, 0, 0], dt: 1 / 60 });
  assert.equal(sideways.forward, true, `${Math.PI / 2} rad is inside the ${WALK_WITHIN_RAD} rad the bot will walk through`);
  assert.equal(sideways.lookDelta, TURN_RATE_RAD_S / 60, 'the turn is capped by the tick, not by the angle');

  const behind = steerTo({ at: [0, 0, 0], heading: 0, target: [0, 0, -10], dt: 1 / 60 });
  assert.equal(behind.forward, false, 'half a turn: stand and turn rather than walk a circle into the wall beside it');
  assert.equal(behind.lookDelta, TURN_RATE_RAD_S / 60);
});

test('BENCH1 track: the turn is a rate, so a slow frame turns as far as a fast one', () => {
  const q = { at: [0, 0, 0], heading: 0, target: [10, 0, 0] };
  assert.equal(steerTo({ ...q, dt: 1 / 30 }).lookDelta, TURN_RATE_RAD_S / 30);
  assert.equal(steerTo({ ...q, dt: 1 / 120 }).lookDelta, TURN_RATE_RAD_S / 120);
  // and at a big dt it is the ANGLE that caps it, not the clock
  assert.equal(steerTo({ ...q, dt: 10 }).lookDelta, Math.PI / 2);
});

test('BENCH1 track: the reach is the caller\'s too - a dungeon walker does not stop two metres short of the corner it is steering at', () => {
  // A street's waypoint is arrived at from 2.5 m; a corridor's is a corner the next leg of the route
  // starts from. The dungeon walk leaves its waypoints behind at WALK_WAYPOINT_M and steers by the same
  // number, or the body stands still between the two: the steerer would call it arrived and release the
  // walk key, while the route would not leave the waypoint behind.
  const street = { at: [0, 0, 0], heading: 0, target: [0, 0, 1.2], dt: 1 / 60 };
  assert.equal(steerTo(street).reached, true, `1.2 m is inside the track's own ${REACH_M} m`);
  assert.equal(steerTo({ ...street, reach: 0.6 }).reached, false, 'and outside the corridor\'s - the body keeps walking to it');
  assert.equal(steerTo({ ...street, reach: 0.6 }).forward, true);
  assert.equal(steerTo({ at: [0, 0, 0], heading: 0, target: [0, 0, 0.6], reach: 0.6 }).reached, true, 'at its own reach it has arrived');
  assert.equal(steerTo({ ...street, reach: NaN }).reached, true, 'a reach that is not a number falls back to the track\'s');
});

test('BENCH1 track: a waypoint inside REACH_M is arrived at, and the look is left alone', () => {
  const s = steerTo({ at: [0, 0, 0], heading: 0, target: [0, 0, REACH_M - 0.1], dt: 1 / 60 });
  assert.equal(s.reached, true);
  assert.equal(s.forward, false);
  assert.equal(s.lookDelta, 0);
});

test('BENCH1 track: the caller may tighten the facing gate - a corridor is walked facing it, a street is not', () => {
  // A dungeon's corridor is two metres wide: a bot that walks forward while 90 degrees off the bearing
  // walks diagonally into the jamb. So the gate is the caller's - the street keeps the wide one and
  // the dungeon walk hands in its own - and the look keeps turning either way.
  const q = { at: [0, 0, 0], heading: 0, target: [10, 0, 0], dt: 1 / 60 };   // a quarter turn off the bearing
  assert.equal(steerTo(q).forward, true, `the track's own ${WALK_WITHIN_RAD} rad walks through a quarter turn`);
  const tight = steerTo({ ...q, withinRad: 0.8 });
  assert.equal(tight.forward, false, 'the tighter gate stands and turns first');
  assert.equal(tight.lookDelta, TURN_RATE_RAD_S / 60, 'and the look is still asked for the tick\'s turn - standing still is not standing blind');
  assert.equal(steerTo({ ...q, withinRad: Math.PI / 2 + 0.01 }).forward, true, 'the gate is the caller\'s number, not a fixed rule');
  assert.equal(steerTo({ ...q, withinRad: NaN }).forward, true, 'a gate that is not a number falls back to the walk\'s own');
});

test('BENCH1 track: nextWaypoint walks the cursor forward, so a shove re-aims at the NEXT waypoint', () => {
  const track = [[0, 0, 0], [0, 0, 5], [0, 0, 10]];
  const first = nextWaypoint(track, [0, 0, 0.2], 0);
  assert.equal(first.index, 1, 'the first point is inside REACH_M - walk at the second');
  assert.equal(first.done, false);
  const mid = nextWaypoint(track, [0, 0, 2], 1);
  assert.equal(mid.index, 1, '3 m short of the second: still the one to walk at');
  const shovedBack = nextWaypoint(track, [0, 0, 1], 2);
  assert.equal(shovedBack.index, 2, 'the cursor never moves backwards - being shoved back re-aims at the waypoint ahead, not the one behind');
  const end = nextWaypoint(track, [0, 0, 10], 2);
  assert.equal(end.done, true, 'every point from the cursor is reached');
  assert.equal(end.target, null);
});

test('BENCH1 track: trackLength is the run the report names, so a bot that walked one step is a number', () => {
  assert.equal(trackLength([[0, 0, 0], [0, 0, 3], [4, 0, 3]]), 7);
  assert.equal(trackLength([[0, 0, 0]]), 0);
  assert.equal(trackLength(null), 0);
});

test('BENCH1 track: validateTrack refuses a track that cannot be walked, and says why', () => {
  assert.equal(validateTrack([{ x: 0, z: 0 }, { x: 0, z: 4 }]).ok, true, 'the object spelling is a point too');
  assert.equal(validateTrack([[0, 0, 0], [0, 0, 4], [6, 0, 4]]).ok, true);
  assert.equal(validateTrack([]).ok, false);
  assert.equal(validateTrack([[0, 0, 0]]).ok, false, 'one waypoint is a place, not a walk');
  const same = validateTrack([[0, 0, 0], [0, 0, 0.1]]);
  assert.equal(same.ok, false);
  assert.match(same.why, /same point/, 'a station is one waypoint, walked once');
  const far = validateTrack([[0, 0, 0], [0, 0, MAX_SEGMENT_M + 10]]);
  assert.equal(far.ok, false);
  assert.match(far.why, new RegExp(String(MAX_SEGMENT_M)), 'the message names the limit it broke');
  const nan = validateTrack([[0, 0, 0], [0, 0, NaN]]);
  assert.equal(nan.ok, false);
  assert.match(nan.why, /waypoint 1/);
});
