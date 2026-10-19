// BENCH1'S LAW (2026-10-19): which legs a run has, THE ONE URL that pins the
// scene they run in, and how a run's per-leg numbers become one score. Data
// and arithmetic only - this module imports NOTHING (no game modules) - so the
// CLI, the page and the test all read the same law. A second list of legs in
// the runner is how two runs both called "street" measure two different
// streets, and a second spelling of the pins is how their numbers become
// incomparable without anyone noticing.
//
// WHY THE SCENE MUST BE PINNED: two numbers are only a comparison when both
// runs stood in the same place, hour, weather, seed, character and quality.
// BENCH_PINS fixes all six, BENCH_PRESET fixes the quality the host applies,
// and the result records the preset beside the numbers - a 90 at 4x4 pixels
// and a 90 at full resolution are not the same achievement, and a benchmark
// that does not say which one it ran is a leaderboard of two games.
//
// THE TWO HARD RULES, both pinned by test/systems/bench/law.test.js:
//   THE URL ALWAYS CARRIES class= - a page without it mounts the chargen
//   wizard, which takes the overlay slot and swallows every key the run
//   presses (test/tooling/probehygiene.test.js T2 and the fifteen probes that
//   lied under exactly that trap).
//   THE URL NEVER CARRIES online - the benchmark is offline only: a relay's
//   peers, rooms and traffic are not part of the number.

/** Frame legs warm the caches for five seconds, then measure twenty. */
const FRAME = Object.freeze({ warmupSeconds: 5, seconds: 20 });

/** The stream leg measures to the settle, not for a fixed window: sixty
 *  seconds is its ceiling, not its subject. */
const STREAM = Object.freeze({ warmupSeconds: 0, seconds: 60 });

/** A census reading's law: the scene fact, and the smallest count that
 *  proves two runs measured the same scene. */
const census = (key, floor) => Object.freeze({ key, floor });

/** The legs of a run, in run order - the capital's streets, the crowd, one
 *  ring of foes in three weapons, a dungeon, and a map journey. Frozen: the
 *  runner, the page and the result all read this one list. */
export const BENCH_LEG_IDS = Object.freeze([
  'street', 'crowd', 'blade', 'bow', 'spell', 'dungeon', 'stream',
]);

/** What each leg is, in player words, and what proves it measured the same
 *  scene: the frame legs (a fixed window after a warmup) and the one stream
 *  leg (measured to the settle). Same order as BENCH_LEG_IDS. `scene` is the
 *  PAGE a leg is played on: the street, the crowd and the stream are the
 *  streaming world's, and the dungeon and its three fights are the standalone
 *  dungeon host's (a dungeon is not a place the streamed world stands the
 *  player in from a URL, and reaching into another host's mode machine to
 *  borrow one is how a benchmark starts measuring its own wiring). */
export const BENCH_LEGS = Object.freeze([
  Object.freeze({ id: 'street', title: 'The street run', kind: 'frame', scene: 'world', ...FRAME, census: census('pixels', 1) }),
  Object.freeze({ id: 'crowd', title: 'The crowd', kind: 'frame', scene: 'world', ...FRAME, census: census('pixels', 1) }),
  Object.freeze({ id: 'blade', title: 'A fight: the blade', kind: 'frame', scene: 'dungeon', ...FRAME, census: census('foes', 3) }),
  Object.freeze({ id: 'bow', title: 'A fight: the bow', kind: 'frame', scene: 'dungeon', ...FRAME, census: census('foes', 3) }),
  Object.freeze({ id: 'spell', title: 'A fight: a spell', kind: 'frame', scene: 'dungeon', ...FRAME, census: census('foes', 3) }),
  Object.freeze({ id: 'dungeon', title: 'The dungeon', kind: 'frame', scene: 'dungeon', ...FRAME, census: census('foes', 3) }),
  Object.freeze({ id: 'stream', title: 'The stream', kind: 'stream', scene: 'world', ...STREAM, census: census('pixels', 1) }),
]);

/**
 * THE BODY A RUN WEARS (BENCH1, Mac's call, 2026-10-19: "A huge health pool instead"). The
 * fight legs must not end with a corpse - a dead player stops the motor, the AI and the frame,
 * and the legs after it measure a death screen. The engine's own `/god` withholds the blow
 * BEFORE the shield pool, the damage modifiers and the evasion roll, which would take the whole
 * damage path out of the measurement; a pool leaves every one of those running and only makes
 * the subtraction small. So the host sets these once, at the start of a run, through the entity
 * the game already has, and the result RECORDS it (`vital`) - a run that healed itself silently
 * would be measuring a different game from the one the player has.
 *
 * A pool is a test body, not a setting: a million hit points is not a character anybody plays,
 * and the numbers it produces are the numbers of the systems running, not of a fight being won.
 */
export const BENCH_VITAL = Object.freeze({ maxHealth: 1000000, health: 1000000 });

/**
 * THE LEGS WHOSE SCENE DOOR IS NOT WIRED YET, each with the reason in a sentence - so a run asks for
 * what it can actually play and SAYS what it left out, instead of coming back red over a door nobody
 * has built. Two are here today:
 *
 *   street - it replays a route, and a route is authored by `npm run tracks` on a machine with the
 *     data (src/systems/bench/tracks.js ships empty on purpose).
 *   stream - measured to the settle, so it needs a JOURNEY to open that queue; the door this build
 *     offers opens the map, not a trip, and the first real run proved it: the leg ended in three
 *     frames and would have reported 7 fps over a second and a half nobody could see. The leg now
 *     fails by name when it is asked for, which is how that was found.
 *
 * An entry comes OUT of this list in the change that wires its door, never by deleting the leg.
 */
export const BENCH_UNWIRED = Object.freeze({
  street: 'its route is authored on a machine with the data - `npm run tracks --headed` writes one',
  stream: 'the map journey it measures needs a destination pick, and this build\'s door opens the map, not a trip',
  blade: 'the dungeon door never mints its character in this build (?class= is not applied on it - reproduced with no benchmark on the page), so the page stands on the character-creation screen',
  bow: 'the dungeon door never mints its character in this build (see the blade leg)',
  spell: 'the dungeon door never mints its character in this build (see the blade leg)',
  dungeon: 'the dungeon door never mints its character in this build (see the blade leg)',
});

/** The legs a page plays. `scene` is 'world' or 'dungeon'; anything else answers none. */
export function legsOf(scene) {
  return BENCH_LEGS.filter((leg) => leg.scene === scene);
}

/** The scene a run pins. `tod: '12:00'` is the game's own parseTimeOfDay
 *  spelling of noon (src/world/worldClock.js); `classId: 16` is the Test
 *  Room's Nord Warrior baseline (src/systems/testRoom.js TEST_PRESETS) - the
 *  plain human male a run can compare across machines. */
export const BENCH_PINS = Object.freeze({
  region: 'Daggerfall', loc: 'Daggerfall', tod: '12:00', weather: 'sunny', wseed: 1, classId: 16,
});

/** THE PRESET A RUN FORCES AND THE RESULT RECORDS: the host applies exactly
 *  these settings before the first leg and writes the preset (and whether the
 *  run was `asIs`) into the result, so two machines' numbers name one quality.
 *  Everything the scene can carry is ON at native scale: a benchmark that
 *  turns the hard things off measures a scene nobody plays. */
export const BENCH_PRESET = Object.freeze({
  renderScale: 1,      // the native pixel count - an upscaled frame flatters every GPU the same way
  shadows: true,       // the sun's shadow pass, which a town's people all cast into
  grass: true,         // the meadow's blades - the fill a street frame pays for its ground
  crowd: true,         // every townsman drawn and animated: the crowd leg's own subject
  trees: true,         // the town's and the wild's trees, drawn and instanced
  reflections: true,   // the sea's and the glass's reflection pass
});

/**
 * The legs a `bench=` spelling asks for: `'street,blade'` becomes
 * `['street','blade']`. Trims each token, drops the empties, and DROPS an id
 * the law does not have (a mistyped leg must not reach the page); `'all'` is
 * every leg. De-duped and answered in BENCH_LEG_IDS' run order, so one set of
 * legs always spells one URL. Anything that is not a string is no legs.
 * @param {unknown} value the `bench=` spelling
 * @returns {string[]} the legs, in run order
 */
export function parseLegs(value) {
  if (typeof value !== 'string') return [];
  const wanted = new Set();
  let all = false;
  for (const raw of value.split(',')) {
    const id = raw.trim();
    if (!id) continue;
    if (id === 'all') all = true;
    else if (BENCH_LEG_IDS.includes(id)) wanted.add(id);
  }
  return all ? [...BENCH_LEG_IDS] : BENCH_LEG_IDS.filter((id) => wanted.has(id));
}

/**
 * THE ONE URL a page of the run uses. Two shapes, one builder, because a run that spelled its
 * two doors separately would drift them apart the first time a door changed:
 *
 *   scene 'world' (the default) - `<base>/play/?world&bench=<ids>&class=16&region=...&loc=...&tod=...
 *   &weather=...&wseed=...&shot&play&fps&perf`
 *   scene 'dungeon' - `<base>/play/?dungeon&bench=<ids>&class=16&shot&play&fps&perf`
 *
 * `&shot&play` on BOTH is deliberate and is the perf discipline the profiler already uses
 * (tools/cpuReport.mjs's own SCENES): `?shot` installs the probe surface the legs read and
 * `?play` keeps the motor on - without it a shot boot is a flying camera and no player, and a
 * benchmark of a camera is a benchmark of nothing. The pins are URL-encoded (only ids the law
 * has can reach the leg list, so it keeps bare commas); a trailing-slash `base` is trimmed and
 * `''` answers a relative `/play/...`; the legs are parsed, unknown ids dropped, ids of the
 * OTHER scene dropped (they are not played on this page), and an empty list falls back to
 * every leg this page can play - a run with no legs is not a run.
 *
 * `asIs: true` appends `&benchpreset=off`, the spelling that tells the host to leave the
 * player's own settings alone: the run then measures the settings on the machine instead of
 * forcing BENCH_PRESET, and the result must record that it did.
 * @param {{ base?: string, legs?: string | string[], asIs?: boolean, scene?: 'world' | 'dungeon' }} [options]
 * @returns {string} the URL, carrying `class=` and never `online`
 */
export function benchUrl({ base = '', legs = BENCH_LEG_IDS, asIs = false, scene = 'world' } = {}) {
  const where = scene === 'dungeon' ? 'dungeon' : 'world';
  const playable = legsOf(where).map((leg) => leg.id);
  const asked = parseLegs(Array.isArray(legs) ? legs.join(',') : legs);
  let ids = asked.filter((id) => playable.includes(id));
  if (!ids.length) ids = playable;
  const root = (typeof base === 'string' ? base : '').replace(/\/+$/, '');
  const enc = (v) => encodeURIComponent(String(v));
  const query = [where, `bench=${ids.join(',')}`, `class=${enc(BENCH_PINS.classId)}`];
  // the world page is a PLACE, and its place is pinned; the dungeon page takes no region, loc,
  // hour or seed - the standalone dungeon host reads none of them, and a parameter a page
  // ignores is a lie about what was held constant
  if (where === 'world') {
    query.push(
      `region=${enc(BENCH_PINS.region)}`,
      `loc=${enc(BENCH_PINS.loc)}`,
      `tod=${enc(BENCH_PINS.tod)}`,
      `weather=${enc(BENCH_PINS.weather)}`,
      `wseed=${enc(BENCH_PINS.wseed)}`,
    );
  }
  query.push('shot', 'play', 'fps', 'perf');
  const url = `${root}/play/?${query.join('&')}`;
  return asIs ? `${url}&benchpreset=off` : url;
}

/** A rate a run can score: a finite number above zero (a 1% low of 0 fps is
 *  a stall, not a measurement). */
const measurable = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * The harmonic mean of a run's legs' 1% lows - the benchmark's own convention
 * for one number out of many legs. A mean of rates is dragged down by the
 * worst leg rather than lifted by the best: 60 and 30 average 40, not 45, so
 * a leg that stutters cannot be paid for by one that flies. Non-finite entries
 * and entries at or below zero are dropped; nothing to average answers null.
 * @param {unknown} values the legs' 1% low frame rates
 * @returns {number | null} their harmonic mean
 */
export function harmonicMean(values) {
  const kept = [];
  if (Array.isArray(values)) for (const v of values) if (measurable(v)) kept.push(v);
  if (!kept.length) return null;
  let sum = 0;
  for (const v of kept) sum += 1 / v;
  return kept.length / sum;
}

/**
 * A run's score out of its legs: `legs: [{ id, lowFps }]`. A leg with no
 * measurable number is not averaged away - it comes back by name in
 * `missing`, because a run that lost a leg must not read as a run that ran
 * them all. `score` and `grade` are null when nothing was measured. The kept
 * ids are answered in the law's run order; an id the law never had is not a
 * leg of this benchmark and is no one's absence.
 * @param {unknown} legs the run's per-leg readings
 * @returns {{ score: number | null, grade: string | null, legs: string[], missing: string[] }}
 */
export function scoreOf(legs) {
  const carried = new Map();
  if (Array.isArray(legs)) {
    for (const entry of legs) {
      const id = entry && typeof entry.id === 'string' ? entry.id : '';
      if (!BENCH_LEG_IDS.includes(id)) continue;
      const v = entry.lowFps;
      const had = carried.get(id);
      // a repeated id keeps a number it was ever given, else the last word
      carried.set(id, measurable(v) ? v : had ?? null);
    }
  }
  const kept = [];
  const missing = [];
  const values = [];
  for (const id of BENCH_LEG_IDS) {
    if (!carried.has(id)) continue;
    const v = carried.get(id);
    if (v === null) missing.push(id);
    else { kept.push(id); values.push(v); }
  }
  const score = harmonicMean(values);
  return { score, grade: gradeOf(score), legs: kept, missing };
}

/**
 * The letter for a score, banded on the 1% low frame rate. THESE BANDS ARE THE
 * BENCHMARK'S OWN CONVENTION, NOT A GAME LAW - nothing in the game grades a
 * machine; they are here so two people can say "an A machine" and mean the
 * same frame rate. Not a finite number grades null; then S at 90 and up, A at
 * 60, B at 40, C at 24, D at 1, and nothing below.
 * @param {unknown} score a 1% low frame rate
 * @returns {'S' | 'A' | 'B' | 'C' | 'D' | null}
 */
export function gradeOf(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  // A BAND IS A BOUNDARY, AND A MEASUREMENT HAS NOISE. A leg of perfectly steady 60 fps computes
  // 1000 / 16.666666666666668 = 59.99999999999564, so banding the raw number graded a flawless 60
  // as a B - found by the host's own test, not by a player. One decimal is the precision the card
  // prints, so it is the precision the band reads.
  const s = Math.round(score * 10) / 10;
  if (s >= 90) return 'S';
  if (s >= 60) return 'A';
  if (s >= 40) return 'B';
  if (s >= 24) return 'C';
  if (s >= 1) return 'D';
  return null;
}

/**
 * Did a leg measure the scene it promised? `census` is an object of counts
 * (people, foes, rooms, pixels) and `floor` is `{ key, floor }` from the leg's
 * own law. Answers `{ ok, why }` with `why` a plain sentence naming the count
 * and the floor ('7 people, the leg promises 8'). A missing reading, a
 * reading that is no finite number, or one under the floor is not ok - two
 * runs whose crowds differ were not the same scene, whatever the fps says.
 * @param {unknown} census the scene's counts
 * @param {{ key?: string, floor?: number } | null} floor the leg's census law
 * @returns {{ ok: boolean, why: string }}
 */
export function censusOk(census, floor) {
  const key = floor && typeof floor.key === 'string' ? floor.key : '';
  const least = floor && typeof floor.floor === 'number' ? floor.floor : 0;
  const count = census && typeof census === 'object' ? census[key] : undefined;
  const noun = key || 'scene';
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    return { ok: false, why: `no ${noun} reading, the leg promises ${least}` };
  }
  return { ok: count >= least, why: `${count} ${noun}, the leg promises ${least}` };
}
