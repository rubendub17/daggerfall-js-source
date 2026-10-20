import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRoute, snapToWalkable, seededRandom, ROUTE_STEP_M, ROUTE_POINTS } from '../../../src/systems/bench/route.js';
import { validateTrack } from '../../../src/systems/bench/track.js';
import { CityNavigation } from '../../../src/world/city/cityNavigation.js';

// BENCH1's route planner: a street route off the town's OWN navigation grid, so the one leg a person
// most wants to watch no longer depends on a route file another machine wrote. The grid here is the
// game's real class with a block of walkable ground - not a fake - so the conversions under test are
// the ones the capital's route uses.

/** A town one block wide, every cell walkable: the simplest grid `CityNavigation` believes in.
 *  DFU's own street weight is 7 (the capital's grid reads `w:7` on a walkable cell) and the high
 *  nibble of the packed cell is the weight, so 0x70 is a street a townsman may be placed on. */
function town() {
  const nav = new CityNavigation(1, 1);
  nav.grid.fill(0x70);
  return nav;
}

/** A seeded generator, so the route is the test's route and not the machine's. */
const seeded = (seed = 1) => {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
};

test('BENCH1 route: a route leaves the centre on the town\'s own walkable cells, in steps a walker can follow', () => {
  const nav = town();
  const route = planRoute({ nav, start: [40, 0, 40], steps: 8, rand: seeded(7) });
  assert.ok(route.length >= 3, `a route, not a point: ${route.length} waypoints`);
  assert.deepEqual([route[0][0], route[0][2]], [40, 40], 'it starts where it was told to');
  for (let i = 1; i < route.length; i++) {
    const d = Math.hypot(route[i][0] - route[i - 1][0], route[i][2] - route[i - 1][2]);
    assert.ok(d > 2 && d <= ROUTE_STEP_M, `step ${i} is ${d.toFixed(1)} m - a walker's step, never a leap`);
    const [gx, gy] = nav.worldToNav(route[i][0], route[i][2]);
    assert.ok(nav.inBounds(gx, gy), `waypoint ${i} stands inside the town's grid`);
  }
  assert.equal(validateTrack(route).ok, true, 'and the track law accepts it, which is the whole point');
});

test('BENCH1 route: it is bounded by what it was asked for, and it is deterministic from its seed', () => {
  const a = planRoute({ nav: town(), start: [40, 0, 40], steps: 5, rand: seeded(11) });
  const b = planRoute({ nav: town(), start: [40, 0, 40], steps: 5, rand: seeded(11) });
  assert.deepEqual(a, b, 'the same seed plans the same walk - a leg can be compared to itself');
  assert.ok(a.length <= 6, 'the start plus at most the steps asked for');
  assert.ok(ROUTE_POINTS >= 8, 'the default route is long enough to be a run, not a shuffle');
});

test('BENCH1 route: a ground sampler gives every waypoint its own y, and no sampler leaves it at 0', () => {
  const nav = town();
  const flat = planRoute({ nav, start: [40, 0, 40], steps: 4, rand: seeded(3) });
  assert.ok(flat.every((p) => p[1] === 0), 'no sampler, no heights');
  const hilly = planRoute({ nav, start: [40, 0, 40], steps: 4, rand: seeded(3), heightAt: (x, z) => 100 + x - z });
  assert.ok(hilly.every((p) => p[1] === 100 + p[0] - p[2]), 'each point stands on the ground under it');
});

test('BENCH1 route: a centre inside a block walks out to the nearest street, never into the block', () => {
  // the second leg of the town legs stands the body at the town's MIDDLE, and the mean of a town's
  // buildings is regularly the inside of one: the crowd leg was measured from wherever the start
  // marker put the player for exactly this reason. `snapToWalkable` is the one search that fixes it.
  const nav = new CityNavigation(1, 1);
  nav.grid.fill(0x00);                       // no streets at all yet
  for (let gx = 0; gx < 64; gx++) nav.grid[20 * 64 + gx] = 0x70;   // one street along row 20
  const mid = [40, 40];                       // the block the buildings' mean lands in
  const cell = snapToWalkable(nav, mid[0], mid[1]);
  assert.ok(cell, 'it finds the street');
  assert.equal(nav.weightAt(cell[0], cell[1]) > 0, true, 'and the cell it finds is one a walker may stand on');
  const [lx, lz] = nav.navToWorld(cell[0], cell[1]);
  assert.equal(Math.abs(lz - 20 * 1.6 - 0.8) <= 1.6, true, `the nearest street row: z ${lz}`);
  // a point already on a street is answered as itself, not moved
  assert.deepEqual(snapToWalkable(nav, lx, lz), nav.worldToNav(lx, lz));
  // a town with no street at all answers null - the caller says why, the search does not guess
  assert.equal(snapToWalkable(new CityNavigation(1, 1), 40, 40), null);
});

test('BENCH1 route: the route is the same on every machine, because its dice are seeded', () => {
  const a = seededRandom(1234), b = seededRandom(1234), c = seededRandom(1235);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB, 'one seed, one sequence');
  assert.notDeepEqual(seqA, [c(), c(), c()], 'and a different seed is a different walk');
  assert.ok(seqA.every((v) => v >= 0 && v < 1), 'an honest uniform');
  // the same town plans the same route twice with it - what makes two runs comparable
  const r1 = planRoute({ nav: town(), start: [40, 0, 40], steps: 6, rand: seededRandom(99) });
  const r2 = planRoute({ nav: town(), start: [40, 0, 40], steps: 6, rand: seededRandom(99) });
  assert.deepEqual(r1, r2);
});

test('BENCH1 route: a town that offers nothing gives no route, and says so with an empty list', () => {
  assert.deepEqual(planRoute({ nav: null, start: [0, 0, 0] }), []);
  assert.deepEqual(planRoute({ nav: town(), start: [NaN, 0, 0] }), [], 'a centre that is not a point');
  // a grid with no walkable cells at all: the game's own placement answers null every time
  const empty = new CityNavigation(1, 1);   // weights all 0: nowhere a walker may stand
  const none = planRoute({ nav: empty, start: [40, 0, 40], steps: 6, rand: seeded(5) });
  assert.ok(none.length <= 1, `nowhere to walk: ${none.length} waypoints`);
});
