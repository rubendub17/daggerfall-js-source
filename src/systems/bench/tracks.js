// BENCH1 - THE BENCHMARK'S TRACKS (2026-10-19). SHIPPED EMPTY ON PURPOSE.
//
// A benchmark's city leg is a WALK, and a route nobody has walked is a benchmark
// of a bot standing in a wall: the numbers that follow would be the frame time of
// a character pressing its nose into a door. Which is why this module carries no
// guessed coordinates. It is WRITTEN, not edited: tools/benchTracks.mjs boots the
// pinned capital, lays the town's doors out as a route no step of which is longer
// than the track law's 40 m, WALKS it with the player's own W key, and overwrites
// this file (the screenshots beside it in tools/shots/ are how a human rejects a
// route that walks through a wall). The emitted shape is the shape below, so a
// regeneration is a diff of numbers and never of spellings:
//
//   export const BENCH_TRACKS = Object.freeze({
//     Daggerfall: Object.freeze([
//       Object.freeze([x, y, z]),   // one line a waypoint; y is the ground the walk stood on
//     ]),
//   });
//
// A PLACE WITH NO TRACK IS A LEG THAT MUST REPORT ITSELF UNRUN. An empty map here
// is not a finished benchmark and must not read as one: systems/bench/bot.js has
// nothing to walk, so a run of the capital's streets has to say "no track for
// Daggerfall" and fail its leg - booting the city and standing still would report
// the frame rate of a character who never moved. Until `npm run tracks -- --headed`
// has run on a machine with ARENA2, every place is untracked, and this comment is
// the reason.
//
// Data and nothing else: frozen, no import, no code. A track is a measurement's
// subject, never a program that could move a body of its own.

/**
 * The benchmark's authored walks, by the place a run pins (BENCH_PINS.region in
 * systems/bench/law.js): a frozen list of frozen `[x, y, z]` waypoints, walked in
 * order by systems/bench/bot.js. EMPTY until tools/benchTracks.mjs has written it -
 * and a place that is missing here is a leg the run must report UNRUN, never a
 * leg it may stand still through.
 */
export const BENCH_TRACKS = Object.freeze({});
