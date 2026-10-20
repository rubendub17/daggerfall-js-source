// BENCH1 - THE BENCHMARK'S HOST (2026-10-19). The module the game's own hosts wire (HOST-SPLIT:
// new behaviour is a module the host wires, `scenes/fishHost.js` being the shape), because a
// benchmark is a MODE of the real game and must not become a fifth copy of it.
//
// WHAT IT IS: a run of legs - the capital's streets at a run, the crowd, a dungeon walked, one
// ring of foes fought three ways, and a map journey measured to the settle - played by the
// game's own motor, AI, renderer and streamer, and measured with the game's own instruments:
// `ui/fpsCounter.js`'s per-frame stamps, `render/perfMeter.js`'s GPU clock, and the profiler's
// own aggregation (`tools/lib/cpuProfile.mjs`) when something is profiling it.
//
// THE HANDS ARE THE PLAYER'S. Nothing here teleports a body: the bot presses the codes the
// player's bindings resolve to (`systems/bench/bot.js`) and the host's wiring turns them into
// the very keydown/keyup a keyboard makes. The one camera write is the look, and it is the
// port's own (`__look`'s `cam.yaw += delta`), because a mouse move on a page with no pointer
// lock is not something a synthetic event can honestly claim.
//
// THE BODY IS A POOL, NOT A GOD (BENCH1, Mac's call, 2026-10-19: "A huge health pool instead").
// `/god` withholds the blow before the shield pool, the damage modifiers and the evasion roll,
// which would take the whole damage path out of a fight leg's measurement. A pool leaves every
// one of them running and only makes the subtraction small; the report records it (`vital`),
// and nothing heals the body mid-run - the ONE write below is the pool, at the start.
//
// A LEG THAT MEASURED NOTHING IS A FAILURE, NAMED. No frames, a scene whose census came up
// short, a stream that never settled, a track nobody authored - each is a sentence in
// `failures`, and a run with one failure is not a measurement (recorder.js's nulls and law.js's
// `missing` are the same law seen from three sides).

import { BENCH_LEGS, BENCH_PRESET, BENCH_VITAL, legsOf, scoreOf, censusOk, parseLegs } from '../systems/bench/law.js';
import { summarise } from '../systems/bench/recorder.js';
import { createBenchBot } from '../systems/bench/bot.js';
import { nextWaypoint, trackLength, validateTrack, distanceTo, bearingTo, wrapAngle } from '../systems/bench/track.js';
import { planRoute, snapToWalkable, seededRandom } from '../systems/bench/route.js';   // BENCH1: a street route off the town's own navigation grid, the same route every run
import { townCentreOf } from './seatBanners.js';   // BENCH1: the town's own middle - the point the Seats hang their banners on, not the mean of its blocks
import { BENCH_TRACKS } from '../systems/bench/tracks.js';
import { nearestFoe, aimYaw, foeFeet, foeCentre, foeHealthTotal } from '../systems/bench/fight.js';   // BENCH1: the fight's own geometry - where a foe IS (its AI's feet, not a `pos` it never had) and where a body must stand to reach it
import { pickWalk, advancePath, walkGoals } from '../systems/bench/dungeonPath.js';   // BENCH1: the dungeon walked on the dungeon's own navmesh, the one its foes already path over
import { createBenchOverlay, reportLines } from '../ui/benchOverlay.js';
import { installInputLock } from '../systems/bench/lock.js';   // BENCH1: the player's hands off the game while the run is live
import { forcePref, clearForcedPref } from '../systems/uiPrefs.js';   // BENCH1: the tutorials off for THIS page and no shelf write - a run must not edit the switch a player keeps
import { dismissTutorials } from '../ui/tutorialPopup.js';   // BENCH1: and the card STANDING on screen put away - it stays until dismissed, and the bench has no hand to press the key
import { testGearRows, testItemOf, testMissileSpells, addTestMissileSpells } from '../systems/testRoom.js';   // BENCH1: the combat kit is the Test Room's (Home.md: one exports, the other imports)

/** How long a swing is held, and how often the next begins. One rhythm for all three weapons:
 *  the host's own ladder decides which system answers the press. */
export const SWING_MS = 420;
export const SWING_EVERY_MS = 700;
/** How long a BOW is held before it looses, milliseconds - a draw is not a swing, and a release at a
 *  fifth of the draw tests the cancel rather than the arrow. */
export const BOW_DRAW_MS = 900;
/** THE ARENA. Every fight leg is measured in the SAME place - the floor the dungeon's own boot stood the
 *  body on - with the body ROOTED there: it turns and looks, it does not walk (the owner: "all the
 *  fighting dungeons should be same space, character can't move its location, it can look at
 *  enemies"). A fixed venue is also what makes two legs comparable: same room, same light, same floor.
 *  FOUR, IN TWO RANKS, and the ring is kept at four: a melee leg kills what is in its reach, so a ring of
 *  two left the archer and the mage facing an empty room (the owner: "the one rat died in the mele fight
 *  and archer and magic only stare at the floor and cast stuff"). */
export const ARENA_SPOT_M = 2.5;    // the NEAR rank, metres - inside the blade's own 2.5 m reach
export const ARENA_FAR_M = 7;       // the FAR rank, metres - room for an arrow to become one
export const ARENA_SIDE_M = 1.4;    // how far either side of the body the near pair stands
export const ARENA_FAR_SIDE_M = 2.6;   // and the far pair, wider so the four are not a column
export const ARENA_RATS = 4;        // the ring: always this many alive, restocked as they die
export const ARENA_KEEP_M = 18;     // a rat this near is the arena's; anything further is the layout's
/** How many rats the arena asks its spawner for in one frame. A spawner builds a sprite body, a career
 *  and an AI, and four of those in one frame is a hitch the benchmark would then measure as the
 *  dungeon's; one a frame fills the ring inside a tenth of a second. */
export const ARENA_SPAWNS_PER_FRAME = 1;
/** How long a CAST is held, and how often the next begins, milliseconds. A spell is slower than a
 *  swing on purpose: the owner watched the mage leg and said "in the mage put a timeout between
 *  spells, it's spamming too much" - a cast costs mana and the ready must be re-made between casts,
 *  so one and a half seconds is the rhythm a caster actually fights at. */
export const SPELL_HOLD_MS = 400;
export const SPELL_EVERY_MS = 1500;
/** How fast the crowd leg turns the view, radians a second - a look around, not a spin. */
export const SWEEP_RAD_S = 0.35;
/** How close the body walks to a foe before it stops to fight, metres - inside the weapon's own
 *  reach (the game measures a blow from the EYE to the foe's mid-capsule, 2.5 m), with room for a
 *  body that keeps drifting. */
export const FIGHT_CLOSE_M = 1.8;
/** How long the Ready Weapon press is held, milliseconds - a few frames, so the host's per-frame
 *  latch sees the edge (a synthetic key that goes down and up inside one frame is never read). */
export const READY_HOLD_MS = 200;
/** How many times a run taps the Ready Weapon key before it accepts that the weapon will not come
 *  out, milliseconds apart (see `drawWeapon`). `WeaponManager.Update`'s arm refuses the key on its
 *  own grounds - a bow's cooldown, a hand still swapping - and the bow's clock is still at zero on
 *  the frame a leg begins, so the first tap of a bow leg is refused by the game's own law. A person
 *  presses again; so does the bot, but only while the rig says the weapon is away, and never more
 *  than a handful of times (the key is a toggle, and a run that tapped it blindly would sheathe the
 *  weapon it just drew). */
export const DRAW_TRIES = 20;
/** How long to wait before the next draw tap, milliseconds - longer than a frame, so the host has
 *  read the press under it before the next one arrives. */
export const DRAW_AGAIN_MS = 400;
/** How long the walk leg waits for the dungeon's own navmesh before it says it has none,
 *  milliseconds - a worker bake of a large collider takes seconds; a page whose AI never bakes must
 *  cost one leg's wait, not a run's. */
export const MESH_WAIT_MS = 30000;
/** How near a destination already walked to is the SAME destination, metres - the leg's memory of
 *  where it has been, so a dungeon is crossed room by room instead of walked to the same foe twice. */
export const WALK_VISITED_M = 8;
/** How long a walk may make no progress before it is pinned rather than walking, milliseconds. */
export const WALK_STUCK_MS = 2500;
/** What counts as progress, metres of NEW ground. A frame's own travel is not the measure: 0.02 m a
 *  frame is a stride at 60 fps and a standstill at 600, so the watch is set in metres and time
 *  (`WALK_STUCK_MS`) rather than per frame - the machine this benchmark measures is the one whose
 *  frame rate is worst, and a walk judged per frame would fail exactly there. */
export const WALK_PROGRESS_M = 1;
/** How far off the bearing a dungeon walker will still walk, radians - tight on purpose. The street's
 *  `WALK_WITHIN_RAD` (1.9) lets the bot cross a street at any angle; a corridor is two metres wide, so
 *  the body turns on the spot first and walks down the corridor instead of diagonally into the jamb. */
export const WALK_FACE_RAD = 0.8;
/** The ground a walked dungeon owes its leg, metres. Under it the body was turning on the spot, or
 *  pinned by a jamb, for the whole window - a walk that went nowhere, whatever the frames say. */
export const WALK_MIN_M = 8;
/** THE DOORS ON THE WALK. A dungeon's navmesh leaves an UNLOCKED ACTION DOOR out of the wall it bakes -
 *  the door is one of the doors its own foes walk through - so a route crosses a shut door and the body
 *  walks its nose into the panel, which is exactly what a person watching saw ("how it walk but cant
 *  open doors"). So the walker opens them the way a person does: look at the door, press the player's
 *  own Activate binding, and let the host's PlayerActivate do the rest. `DOOR_LOOK_M` is how far the
 *  page reports doors from, `DOOR_OPEN_M` the reach the walker presses one from (inside the player's
 *  own activation ray), and `DOOR_PRESS_MS` how often a door it cannot open yet is asked again. */
export const DOOR_LOOK_M = 6;
export const DOOR_OPEN_M = 2.4;
export const DOOR_PRESS_MS = 700;
/** How far off the bearing a door may be and still be one the walk is walking THROUGH, radians - a door
 *  behind the shoulder is one the route will come back for, and a press at it would open the way the
 *  body is not going. */
export const DOOR_FACE_RAD = 1.2;
/** How many times a run will ask for its torch before it leaves the dungeon as dark as it found it, and
 *  how long between asks, milliseconds. A press is refused while both hands hold a weapon (the bow leg
 *  is exactly that), so the light is asked for again once a hand is free. */
export const TORCH_TRIES = 6;
export const TORCH_AGAIN_MS = 1200;
/** How many times the arena asks its spawner to fill ONE slot. A spawner that refuses its spot (inside a
 *  wall, a missing career file) answers null; asking it for ever would spend the leg, so a slot gives up
 *  after a handful and the leg says by name that the ring stood short. */
export const ARENA_SPAWN_TRIES = 4;
/** How near a waypoint counts as reached while WALKING a dungeon route, metres. The dungeon's own foe
 *  AI reaches its waypoints at 0.45 m; a looser 1.2 m cuts the corner of a corridor and walks the body
 *  into the wall it cut. */
export const WALK_WAYPOINT_M = 0.6;
/** The legs that are FIGHTS: the blade, the bow and the spell. Each is stood in its ring before the
 *  warmup, and each proves at its end that its own blows took something off the foes' health. */
export const FIGHT_IDS = Object.freeze(['blade', 'bow', 'spell']);
/** How long a run waits for `?class=` to mint its character before it names the absence as the
 *  failure, milliseconds. The mint is a few hundred milliseconds on an idle machine and seconds on a
 *  busy one - and a benchmark that measured the creation wizard would be measuring nothing. */
export const BODY_WAIT_MS = 60000;
/** The seed a town's street route is planned from: its own pixel, so the same town is the same walk
 *  on every machine - the one thing two benchmark runs must share. */
export const routeSeed = (px, py) => (((Number(px) || 0) * 73856093) ^ ((Number(py) || 0) * 19349663) ^ 0x9e3779b9) >>> 0;

/**
 * The world page's benchmark, wired from what only the streaming host knows. The host passes
 * THUNKS and the page's own furniture; this module turns them into the deps `createBenchHost`
 * reads, so the host grows by a call and not by a mode (HOST-SPLIT).
 * @param {{
 *   params: URLSearchParams, built: Map<any, any>, bindings: () => any,
 *   codeForAction: (store:any, action:string) => string | null,
 *   feet: () => number[], heading: () => number, turnBy: (rad:number) => void,
 *   entity: () => any, renderer: () => any, settle: () => boolean,
 *   travel?: (() => boolean) | null, build?: (() => string | null) | null, document?: any,
 * }} host
 */
export function createWorldBench(host) {
  // THE TOWN'S CENTRE, THE ROUTE AND A JOURNEY, answered here rather than in the host (HOST-SPLIT:
  // the host hands world - its state, motor, camera and a few doors - and this module asks the
  // questions). The centre is the town's own middle (`seatBanners.townCentreOf`, the mean of its
  // buildings - the same point the Seats hang their banners on), snapped to the nearest cell a
  // walker can stand on, because the mean of a town's buildings is regularly the inside of a block.
  // The route is planned off that same navigation grid, from where the body actually is.
  const w = host.world ?? null;
  const pixelNow = () => {
    if (!w?.state?.current) return null;
    const p = host.built?.get?.(`${w.state.current.x},${w.state.current.y}`) ?? null;
    return p?.population?.nav ? p : null;
  };
  const offsetOf = (p) => {
    const t = w.state.pixelTranslation(p.px, p.py);
    return [p.locOrigin[0] + t[0], p.locOrigin[2] + t[2]];   // pixel-local -> the world's x and z
  };
  const toWorld = (p, lx, lz) => {
    const off = offsetOf(p);
    const x = lx + off[0];
    const z = lz + off[1];
    return [x, w.heightAt ? (w.heightAt(x, z) ?? 0) : 0, z];
  };
  /** The town's middle, in the pixel's local frame and on a walkable cell - or null. */
  const centreCell = (p) => {
    const mid = townCentreOf(p.homeFrames ?? null);
    return snapToWalkable(p.population.nav, mid[0], mid[1]);
  };
  /** ONE PIXEL NEXT DOOR, built by the streaming host's own builder - the stream leg's subject. */
  const journeyFn = () => {
    // A PLACE THAT IS ACTUALLY AWAY FROM HERE. The first cut built the pixel NEXT DOOR, and a person
    // watching said what they saw: "the stream didn't do nothing" - the neighbour is regularly open
    // wild, so the leg measured one thin pixel and the window showed a field. The destination is the
    // engine's own answer to "somewhere else": `__travelNearest`, the probe behind the travel map's
    // search, which answers a DISCOVERED location at least two map pixels away. Far enough that
    // arriving is an arrival, and the same place every run, because discovery is the save's and not
    // the dice's. A page with no map to ask falls back to the neighbour it always had.
    const here = w?.travelPixel ? w.travelPixel() : null;
    let px = null;
    try {
      const said = globalThis.window?.__travelNearest?.();
      const far = typeof said === 'string' ? JSON.parse(said) : said;
      if (far?.pixel && Number.isFinite(far.pixel.x) && Number.isFinite(far.pixel.y)) px = far.pixel;
    } catch { px = null; }
    if (!px && here) px = { x: here.x + 1, y: here.y };
    if (!px || !w?.build) return false;
    try { w.build(px.x, px.y); } catch { return false; }
    return true;
  };
  /**
   * THE TOWN, WHETHER OR NOT THE BODY IS STANDING IN IT. `pixelNow` is the pixel the player is in,
   * and a boot lands a body at a start marker or the location's edge - regularly a wilderness
   * neighbour with no population at all. Answering only that pixel left the crowd leg standing at
   * the arrival spot with nobody about (the crowd is stood within 150 units of the PLAYER, so an
   * empty street was the bench's own doing, not the capital's), and it made the street leg report
   * "no navigation grid where the player stands" about a town that had one all along. So: the
   * player's own pixel when it is a town, else the nearest built pixel that carries a navigation
   * grid - nearest by the map's own pixel distance, which is all a streamed town's frame offers.
   */
  const townPixel = () => {
    const own = pixelNow();
    if (own) return own;
    const at = w?.cam?.pos ?? null;
    let best = null, bestD = Infinity;
    for (const p of host.built?.values?.() ?? []) {
      if (!p?.population?.nav || !p.locOrigin) continue;
      let d = 0;
      if (at) {
        const t = w.state.pixelTranslation(p.px, p.py);
        d = Math.hypot(at[0] - (p.locOrigin[0] + t[0]), at[2] - (p.locOrigin[2] + t[2]));
      }
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  };
  return createBenchHost({
    scene: 'world',
    params: host.params,
    feet: host.feet,
    heading: host.heading,
    turnBy: host.turnBy,
    press: (code) => hostSyntheticKey('keydown', code),
    release: (code) => hostSyntheticKey('keyup', code),
    codes: () => {
      const store = host.bindings();
      const of = (action) => host.codeForAction(store, action);
      return { forward: of('MoveForwards'), run: of('Run'), swing: of('SwingWeapon') };
    },
    entity: host.entity,
    renderer: host.renderer,
    settle: host.settle,
    census: (key) => {
      // THE SCENE'S OWN CENSUS, asked of the host that knows. `people` arrives as `host.people()`
      // because "how many townsfolk are about" is the host's own question (its probe answers it for
      // the HUD and the screenshot); the built-pool walk here is the fallback for a host that hands
      // none. The first real run on a machine read 0 with this walk alone - the crowd of a streamed
      // town is not in the pixel records the fallback reads - and a benchmark that calls a busy
      // street empty is a benchmark whose census is wrong, not a street that is empty.
      if (key === 'people') {
        if (typeof host.people === 'function') {
          const n = host.people();
          if (Number.isFinite(n)) return n;
        }
        let n = 0;
        for (const p of host.built?.values?.() ?? []) {
          if (!p?.population) continue;
          for (const it of p.population.pool) if (it.active) n++;
        }
        return n;
      }
      if (key === 'pixels') return host.built?.size ?? 0;
      return null;
    },
    centre: () => {
      const p = townPixel();
      const cell = p ? centreCell(p) : null;
      if (!cell) return null;
      const [lx, lz] = p.population.nav.navToWorld(cell[0], cell[1]);
      return toWorld(p, lx, lz);
    },
    goTo: (pt) => (Array.isArray(pt) && w?.spawn ? w.spawn(pt) : false),
    route: () => {
      const p = townPixel();
      if (!p) return [];
      const nav = p.population.nav;
      // FROM THE BODY'S OWN PLACE, not from the town's middle: the walk a person watches starts
      // wherever the leg put the player (the crowd and street legs are both stood in the centre),
      // and a route from a point the body is not at makes the first waypoint a straight line
      // through whatever stands between.
      const off = offsetOf(p);
      const feet = host.feet?.() ?? null;
      const local = feet ? [feet[0] - off[0], feet[2] - off[1]] : null;
      let start = local;
      if (!start || nav.weightAt(...nav.worldToNav(start[0], start[1])) <= 0) {
        const cell = centreCell(p);
        if (!cell) return [];
        start = nav.navToWorld(cell[0], cell[1]);
      }
      return planRoute({ nav, start: [start[0], 0, start[1]], rand: seededRandom(routeSeed(p.px, p.py)) })
        .map(([lx, , lz]) => toWorld(p, lx, lz));
    },
    journey: journeyFn,
    // THE STREAM LEG'S START. Its subject is the hitch of ARRIVING somewhere the world has not begun
    // to build, and the engine's own door for that is the PIXEL BUILDER (`__pixelBuild`, the
    // streaming host's own probe) - not the travel map. The map is a window a person picks a
    // destination in, and a benchmark has no hand to pick one with: the first real run's stream leg
    // opened the map, waited on a queue nobody had started, and failed by name after sixty seconds.
    // One pixel next door, built by the real builder, is the same work the game does when a player
    // walks across the border; the pixels it builds are the pixels a walk would have queued.
    travel: () => {
      try { return journeyFn() ?? false; } catch { return false; }
    },
    build: host.build ?? null,
    document: host.document,
  });
}

/** A synthetic key edge - the idiom ui/gamepadInput.js already speaks ("a button's edge is a
 *  synthetic KeyboardEvent whose code is the Unity name"), so no host learns a second vocabulary
 *  and `systems/inputActions.js` resolves the code exactly as it resolves a keyboard's. */
function hostSyntheticKey(type, code) {
  const w = globalThis.window;
  const K = globalThis.KeyboardEvent;
  if (!w || typeof K !== 'function' || !code) return;
  w.dispatchEvent(new K(type, { code, bubbles: true }));
}


/**
 * The dungeon page's benchmark. Its legs are the same ring of foes fought three ways and the
 * dungeon walked, and the three ways are ARMED HERE from the Test Room's own producers - never from
 * a second item table: `testGearRows`/`testItemOf` for the bow and its quiver, `addTestMissileSpells`
 * for something that flies.
 *
 * THE HANDS THE DUNGEON ANSWERS. A melee, a bow and a spell are one DOOR in this host
 * (`playerAttackInput`, which runs `magic.interceptAttack` first and `weaponRig.attackInput`
 * otherwise), and it is a MOUSE door: `SwingWeapon` binds to `Mouse1`, `swingKeyHeld` deliberately
 * skips mouse codes, and the only other way in is a real `mousedown` on the window. A synthetic
 * `KeyboardEvent{code:'Mouse1'}` therefore reaches nothing at all - the first real run's fights were
 * a body standing still, swinging the air in front of a foe 20 m away. So the dungeon page hands the
 * bench the door the mouse itself calls, and the bench holds it exactly as long as the bot holds the
 * key (see `deps.attack`): one press for all three weapons, one release that fires the arrow.
 *
 * AND THE WEAPON IS READIED FIRST. A classic character starts with the weapon sheathed
 * (`playerWeapon.sheathed = true`) and `attackInput` returns on it, so the run presses the player's
 * own Ready Weapon binding before the first fight leg - a key, so a synthetic press is honest here.
 * A PRESS IS NOT A DRAW, THOUGH: `WeaponManager.Update`'s arm refuses the key on its own grounds
 * (`weaponRig.readyWeapon`, :229-269 - a bow's cooldown among them, and the bow's clock is still at
 * zero on the frame a leg begins), and the key is a TOGGLE. So the press is repeated only while
 * `deps.drawn` - the rig's own `Sheathed` read - says the weapon did NOT come out, which is what a
 * person does when Z does nothing. Without that read the press is made once and never repeated: a
 * blind second tap would just put the weapon away again.
 *
 * THE QUIVER IS CARRIED, NOT WORN. `equipItem` refuses an Arrow by its own line ("cannot equip
 * arrows"), so the quiver row goes into the pack through `deps.stow` - which is where `spendAmmoFor`
 * spends from and where the bow's own guard (`bowArrowGuard`) counts it. A bow with no quiver in the
 * PACK is sheathed on its first draw frame and looses nothing at all.
 *
 * THE BODY IS STOOD BEFORE ITS WARMUP. A fight leg is measured on the fight, not on the walk to it:
 * the leg's venue is set in `prepareLeg` (the same way the town legs are stood in the town's
 * middle), never during a measured frame. The walk leg is the one that asks about pathing, and it
 * asks the engine (`findPath` over the dungeon's own baked navmesh, which the foes themselves use).
 * @param {{
 *   params: URLSearchParams, feet: () => number[], heading: () => number,
 *   turnBy: (rad:number) => void, entity: () => any, renderer?: (() => any) | null,
 *   foes: () => any[], bindings: () => any, codeForAction: (store:any, action:string) => string | null,
 *   spellsByIndex?: (() => any) | null, setReadied?: ((spell:any) => void) | null,
 *   equip?: ((item:any) => void) | null, stow?: ((item:any) => void) | null,
 *   drawn?: (() => boolean) | null, warp?: ((pt:number[]) => boolean) | null,
 *   attack?: ((held:boolean) => void) | null, plan?: ((from:number[], to:number[]) => number[][] | null) | null,
 *   sites?: (() => number[][]) | null,
 *   aimAt?: ((pt:number[]) => void) | null, navReady?: (() => boolean) | null, document?: any,
 * }} host
 */
export function createDungeonBench(host) {
  /** The spell a spell leg fights with, readied again before every blow (`rearm`) - null on every
   *  other leg. A cast SPENDS the ready (`releaseFrame`'s own `readiedSpell = null`), so a leg that
   *  readies once casts once and then swings the air for the rest of its twenty seconds. */
  let spellFor = null;
  const armGear = (id) => {
    const body = host.entity?.();
    spellFor = null;
    if (!body) return;
    if (id === 'blade') {
      // A BLADE IN THE HAND, NOT THE FIST. The pins mint a Nord Warrior whose chargen kit is not a
      // swung weapon, and the blade leg was measured over a body punching the air (the owner: "in
      // the blade combat the guy is hand to hand"). The Test Room's own rows arm every weapon type
      // once in steel, so the leg takes its longsword from there - the same table the bow comes
      // from, and no second item list.
      const rows = testGearRows(body.gender);
      const sword = rows.find((r) => r.kind === 'weapon' && /longsword/i.test(String(r.label ?? '')))
        ?? rows.find((r) => r.kind === 'weapon' && /sword|saber|katana|axe|mace|warhammer/i.test(String(r.label ?? '')));
      if (sword && host.equip) host.equip(testItemOf(sword));
    }
    if (id === 'bow') {
      // A BOW WITHOUT A QUIVER TESTS THE REFUSAL, NOT THE WEAPON - the Test Room's own note on its
      // rows. The quiver is a row of its own there, so it is taken here too, or the leg measures a
      // drawn string that can never loose. It cannot be EQUIPPED (arrows are ammunition, and
      // `equipItem` says so), so it is STOWED.
      const rows = testGearRows(body.gender);
      const bow = rows.find((r) => r.kind === 'weapon' && /bow/i.test(String(r.label ?? '')));
      if (bow && host.equip) host.equip(testItemOf(bow));
      const quiver = rows.find((r) => r.kind === 'arrows');
      if (quiver && host.stow) host.stow(testItemOf(quiver));
    }
    if (id === 'spell') {
      const index = host.spellsByIndex?.() ?? null;
      addTestMissileSpells(body, index);
      const flier = testMissileSpells(index)[0] ?? null;
      spellFor = flier;
      if (flier && host.setReadied) host.setReadied(flier);
      // THE MANA TO CAST IT WITH, and it is the SAME KIND OF WRITE AS THE HEALTH POOL: a leg's
      // venue, set before its warmup and recorded on the card. The pinned character is a Nord
      // Warrior (class 16) - a body with no spell points at all - so a spell leg without this line
      // measures a hand that cannot cast, which is not the spell system's frame rate.
      if (Number.isFinite(body.maxMagicka) && body.maxMagicka > 0) body.magicka = body.maxMagicka;
    }
  };
  /** Ready this leg's spell again - asked at each blow's start (see `deps.rearm`), and only while
   *  the hand is EMPTY: `readiedSpell` is still set while a cast is in the air (it is cleared at the
   *  release frame), so this cannot ready a second cast under the first. A spell leg that never
   *  re-readied itself cast exactly once and spent the rest of the leg on an empty hand. */
  const rearm = () => {
    if (!spellFor || !host.setReadied) return;
    if (typeof host.readied === 'function' && host.readied()) return;   // a spell is already in hand
    host.setReadied(spellFor);
  };
  /** Draw the weapon - once per run, before the first weapon fight. The binding is the player's own
   *  (`ReadyWeapon`), and the press is held long enough for the host's per-frame latch to see it.
   *  Repeated only while `host.drawn` says the weapon is still away (`DRAW_TRIES` taps at most, and
   *  the same key is never left down), because the key is a toggle and a blind second tap would
   *  sheathe what the first one drew. */
  let drew = false;
  let drawTries = 0;
  let walkNext = false;
  let ratKills = 0;             // how many the leg has killed - the arena's own proof that a fight happened
  /** A NEW LEG'S WEAPON IS A NEW DRAW. `armGear` equips the leg's own weapon, and an equip puts the
   *  weapon AWAY (`playerWeapon.sheathed` goes true on the swap) - so the bow leg began with the
   *  Ready Weapon press already spent on the blade's, the rig refusing every press behind
   *  `sheathed`, and twenty seconds of a drawn string that never loosed. The count is per leg. */
  const forgetTheDraw = () => { drew = false; drawTries = 0; };
  const drawWeapon = () => {
    if (drew || drawTries >= DRAW_TRIES) return;
    const answerable = typeof host.drawn === 'function';   // can this page say whether the hand is out?
    if (answerable && host.drawn()) { drew = true; return; }   // nothing to draw
    drawTries++;
    // ONE DOOR PER TAP, NEVER TWO: the ready is a TOGGLE, so pressing the door and the key in the
    // same breath draws the weapon and puts it straight back - which is exactly what a first cut of
    // this did, and it took the blade leg down with it. The door (`weaponRig.readyWeapon()`, the
    // rung the Ready Weapon key's poll ends in) answers for a page that wires one; a page that does
    // not gets the key press it always had.
    if (typeof host.ready === 'function') {
      try { host.ready(); } catch { /* a rig that refused */ }
      if (!answerable) drew = true;
      else globalThis.setTimeout?.(() => { if (!drew) drawWeapon(); }, DRAW_AGAIN_MS);
      return;
    }
    let code = null;
    try { code = host.codeForAction?.(host.bindings?.(), 'ReadyWeapon') ?? null; } catch { code = null; }
    if (!code) return;
    hostSyntheticKey('keydown', code);
    globalThis.setTimeout?.(() => {
      hostSyntheticKey('keyup', code);
      // A PAGE THAT CANNOT ANSWER GETS THE ONE PRESS IT ALWAYS HAD. One that can answer gets another
      // tap while the weapon is still away - the frame after this one is where the host reads the
      // press, so the next tap waits a beat (DRAW_AGAIN_MS) for that frame to pass.
      if (!answerable) drew = true;
      else globalThis.setTimeout?.(() => { if (!drew) drawWeapon(); }, DRAW_AGAIN_MS);
    }, READY_HOLD_MS);
  };

  /** THE LIGHT IN THE HAND. A dungeon is dark until somebody lights something, and the pinned character
   *  carries nothing to light - the run pressed the player's own Light-or-douse binding for a whole
   *  release and the dungeon stayed black. So the torch is STOWED first, exactly the way the quiver is:
   *  a row of the Test Room's own table, minted by its own producer, never by this module (ONE DFU
   *  MEMBER, ONE EXPORT - a second item table is how two of them disagree). */
  let torchStowed = false;
  const stowTorch = () => {
    if (torchStowed || typeof host.stow !== 'function') return;
    const torch = testGearRows(host.entity?.()?.gender).find((r) => r.kind === 'light');
    if (!torch) return;
    try { host.stow(testItemOf(torch)); torchStowed = true; } catch { /* a pack that refused */ }
  };
  /** Is a light of ours burning? The page's own read; a page that cannot answer is trusted (its press is
   *  the only evidence there is, and asking twice would douse the torch it just lit). */
  const litNow = () => (typeof host.lit === 'function' ? !!host.lit() : lit);
  /** Free a hand for the light. A drawn bow takes both, and Handheld Torches refuses the press behind
   *  it ("no free hand") - so the Ready Weapon door is pressed while the page says a weapon IS out. It is
   *  the same toggle the draw uses, which is why it is asked only once the page has answered. */
  const freeHand = () => {
    if (typeof host.drawn !== 'function' || !host.drawn()) return;
    try { host.ready?.(); } catch { /* a rig that refused */ }
  };
  /** LIGHT THE DUNGEON. A dungeon is dark until somebody lights something - that is the game, not a
   *  benchmark bug - and a run nobody can see is not a run the owner can judge (the second watch: "the
   *  guy isn't going through the dungeon", over a screen the torches could not reach). The press is the
   *  player's OWN Light-or-douse binding, the torch is the pack's, and the ask is repeated while the page
   *  says it is still dark: the first press of a run is regularly refused because the last leg's weapon
   *  still has both hands. A press that DID light it is not repeated - that would douse it. */
  let lit = false;
  let torchTries = 0;
  const lightUp = (freeIt = false) => {
    if (litNow()) { lit = true; return; }
    if (torchTries >= TORCH_TRIES) return;
    let code = null;
    try { code = host.codeForAction?.(host.bindings?.(), 'TorchToggleLight') ?? null; } catch { code = null; }
    if (!code) return;
    torchTries++;
    stowTorch();
    // ASKED ONLY ON THE WALK: a fight leg's hands are FULL ON PURPOSE (a drawn bow is the bow leg's
    // whole subject), and putting the weapon away to light a torch would measure a different leg.
    if (freeIt) freeHand();
    hostSyntheticKey('keydown', code);
    globalThis.setTimeout?.(() => hostSyntheticKey('keyup', code), READY_HOLD_MS);
    globalThis.setTimeout?.(() => { if (!litNow()) lightUp(freeIt); }, TORCH_AGAIN_MS);
  };
  /** Stand the body in the fight: on the line between it and the nearest live foe, at striking
   *  distance. Answers whether it moved - a page that offers no warp keeps the body where it is and
   *  the fight leg says so by name. */
  /**
   * STAND IN THE ARENA - the same floor for every fight leg, and the body stays there. The spot is the
   * dungeon's own boot spawn (`host.entry`), a floor the navmesh and the collider both know; the body is
   * put there once per leg and never moved again, because a fight that also walks measures two systems
   * and shows a viewer a body sliding about instead of a fight.
   */
  const standInTheArena = () => {
    const spot = host.entry?.() ?? null;
    if (!spot) return false;
    return host.warp?.(spot) !== false;
  };
  /** THE RING'S FOUR SLOTS: two at arm's length for the blade, two across the room for the bow and the
   *  spell. Each slot remembers the rat standing in it, so a rat that falls leaves ITS place to be filled
   *  again - the ring never drifts into one rank, and the archer's far rat is never the one the blade's
   *  last blow stood two metres away. */
  const ring = Object.freeze([-ARENA_SIDE_M, ARENA_SIDE_M, -ARENA_FAR_SIDE_M, ARENA_FAR_SIDE_M].map((side, i) => (
    { side, away: i < 2 ? ARENA_SPOT_M : ARENA_FAR_M, rec: null, pending: false, tries: 0 }
  )));
  /** Where a rat is stood: in front of the body, to one side or the other, so the four are a ring and
   *  not a stack. */
  const ratSpot = (side, heading, at, away) => [
    at[0] + Math.sin(heading) * away + Math.cos(heading) * side,
    at[1],
    at[2] + Math.cos(heading) * away - Math.sin(heading) * side,
  ];
  /** KEEP THE RING AT FOUR. A leg that kills its rats and then swings at a wall for the rest of its window
   *  measures nothing, and a ring of two left the archer and the caster with an empty room - "the one rat
   *  died in the mele fight and archer and magic only stare at the floor". A slot's rat that is DEAD, or
   *  GONE (chased past the ring, or a body that never landed), is no rat: the slot is filled again. Only
   *  the ring's own rats count; the layout's are not the arena's. */
  const restock = (heading, at) => {
    if (typeof host.spawnRat !== 'function') return;
    let asked = 0;
    for (const slot of ring) {
      if (slot.rec) {
        if (slot.rec.dead) { ratKills++; slot.rec = null; }   // a fallen rat is the proof a fight happened
        else { const f = foeFeet(slot.rec); if (!f || distanceTo(f, at) > ARENA_KEEP_M) slot.rec = null; }
      }
      if (slot.rec || slot.pending || asked >= ARENA_SPAWNS_PER_FRAME || slot.tries >= ARENA_SPAWN_TRIES) continue;
      asked++;
      slot.pending = true;
      slot.tries++;
      const done = (rec) => { slot.pending = false; if (rec && !rec.dead) { slot.rec = rec; slot.tries = 0; } };
      try {
        const made = host.spawnRat(ratSpot(slot.side, heading, at, slot.away));
        if (made && typeof made.then === 'function') made.then(done).catch(() => { slot.pending = false; });
        else done(made);
      } catch { slot.pending = false; }
    }
  };
  return createBenchHost({
    scene: 'dungeon',
    params: host.params,
    feet: host.feet,
    heading: host.heading,
    turnBy: host.turnBy,
    press: (code) => hostSyntheticKey('keydown', code),
    release: (code) => hostSyntheticKey('keyup', code),
    codes: () => {
      const store = host.bindings();
      const of = (action) => host.codeForAction(store, action);
      // `activate` is the player's OWN ActivateCenterObject - the door a person's E is (PlayerActivate),
      // so a walker opens a dungeon's doors with the key the player has, not with a bench-only door.
      return { forward: of('MoveForwards'), run: of('Run'), swing: of('SwingWeapon'), activate: of('ActivateCenterObject') };
    },
    entity: host.entity,
    renderer: host.renderer ?? null,
    // THE DUNGEON IS BUILT WHOLE AT BOOT - but the WALK waits for the mesh it is walked on. The
    // navmesh the foes themselves path over is baked by the dungeon's own enhanced AI on its first
    // frames (a worker bake of the collider's many thousand triangles), and a route asked for
    // before it lands answers null. So the WALK leg's settle phase is "the mesh is here" - a truth
    // of this scene, not a stream - and only that leg waits: a fight leg has nothing to wait for,
    // and a page whose AI never bakes must cost one leg's wait, not four (`MESH_WAIT_MS`).
    settle: () => (walkNext && typeof host.navReady === 'function' ? !!host.navReady() : true),
    settleCeilingMs: MESH_WAIT_MS,
    census: (key) => (key === 'foes' ? (host.foes?.()?.length ?? 0) : null),
    prepareLeg: (id) => {
      walkNext = id === 'dungeon';
      armGear(id);
      forgetTheDraw();   // this leg's weapon was just put away by its own equip: draw it again
      // THE WALK CARRIES THE LIGHT. Nothing the fight legs held is left in a hand - a drawn bow takes
      // both, and the torch's own law refuses the press behind it - and the torch is asked for with a
      // fresh budget, because the light is what makes the dungeon watchable at all.
      if (walkNext) {
        torchTries = 0;
        lightUp(true);   // and it puts a weapon away first: a drawn bow has no hand for a torch
        // AND IT BEGINS WHERE THE DUNGEON BEGINS. A fight leg has just stood the body at a foe's
        // shoulder - regularly a corner no navmesh floor survived - and a route whose start cannot be
        // placed is no route at all (the run before this one tried forty-two destinations and found
        // none). The entry is the floor the enhanced AI's own bake anchors on.
        try { host.warp?.(host.entry?.() ?? null); } catch { /* no entry: walk from where it stands */ }
        return;
      }
      lightUp();   // a dungeon nobody can see is a run nobody can judge
      // THE WEAPON IS DRAWN FOR THE WEAPONS, AND THE CASTER KEEPS IT AWAY. A readied spell fires
      // through a sheathed hand (`playerAttackInput` runs `magic.interceptAttack` BEFORE the sheath
      // gate - DFU's cast is a component of its own), and `readyWeapon`'s own arm ABORTS a readied
      // spell and sheathes the weapon in the same press: the Ready Weapon key on a spell leg would
      // take the leg's spell away from it.
      if (id !== 'spell') drawWeapon();
      standInTheArena();
    },
    foes: () => host.foes?.() ?? [],
    foeHealth: () => foeHealthTotal(host.foes?.() ?? []),
    rearm,   // BENCH1: the spell leg's ready, made again before each blow (a cast spends it)
    attack: host.attack ?? null,
    aimAt: host.aimAt ?? null,
    level: host.level ?? null,
    spawnRat: host.spawnRat ?? null,
    restockArena: restock,
    // THE RING'S OWN RAT, chosen by the weapon: `want` is 'near' (a blade's or a spell's) or 'far' (a
    // bow's). Nearest or farthest of the RING's rats - never the layout's, which stand behind walls the
    // missile then hits. Answers null when the ring stands none, and the leg says so by name.
    arenaFoe: (at, want) => {
      const live = ring.filter((s) => s.rec && !s.rec.dead)
        .map((s) => ({ rec: s.rec, p: foeFeet(s.rec) }))
        .filter((x) => x.p && distanceTo(x.p, at) < ARENA_KEEP_M)
        .sort((a, b) => distanceTo(a.p, at) - distanceTo(b.p, at));
      if (!live.length) return null;
      return (want === 'far' ? live[live.length - 1] : live[0]).rec;
    },
    arenaKills: () => ratKills,   // BENCH1: the ring's fallen, the proof a fight happened
    drawn: host.drawn ?? null,
    ready: host.ready ?? null,
    readied: host.readied ?? null,
    lit: host.lit ?? null,   // BENCH1: is a light of ours burning - the torch ask is repeated while it is not
    stow: host.stow ?? null,
    entry: host.entry ?? null,
    plan: host.plan ?? null,
    sites: host.sites ?? null,   // BENCH1: the dungeon's own floor as places, so the walk crosses it instead of walking to the rats and back
    doors: host.doors ?? null,   // BENCH1: the action doors near the walk, so it opens them instead of walking into them
    build: null,
    document: host.document,
  });
}


/** How long a leg may wait for the stream to settle before it starts anyway, milliseconds. A
 *  benchmark that measured a loading screen would report the loader's frame rate as the town's. */
export const SETTLE_CEILING_MS = 180000;
/** The shortest a stream leg may be, milliseconds. Measured to the settle, yes - but the settle of a
 *  journey that never left is immediately true, and the first real run's stream leg lasted three
 *  frames: a second and a half nobody could see, reported as a 7 fps leg. */
export const STREAM_MIN_MS = 8000;
/** How long the ARRIVAL is watched after the body is stood in the new place, milliseconds - the leg's
 *  whole subject is the hitch of arriving, and an arrival nobody sees is not what a person means by
 *  "the stream did nothing". */
export const STREAM_LAND_MS = 6000;

/** Seconds to milliseconds, the law's own unit into the frame's. */
const toMs = (s) => Math.max(0, Number(s) || 0) * 1000;

/** The wrap of a bearing into (-PI, PI], the way a look turns. */
const turnTo = (want, have) => {
  let d = (Number(want) || 0) - (Number(have) || 0);
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
};

/**
 * The benchmark host.
 * @param {{
 *   scene: 'world'|'dungeon',
 *   params?: URLSearchParams | null,
 *   feet: () => number[], heading: () => number, turnBy: (rad:number) => void,
 *   press: (code:string) => void, release: (code:string) => void,
 *   codes: () => { forward?:string, run?:string, swing?:string, activate?:string } | null,
 *   entity: () => any, renderer?: (() => any) | null,
 *   settle?: (() => boolean) | null,
 *   settleCeilingMs?: number | null,
 *   census?: ((key:string) => number | null) | null,
 *   prepareLeg?: ((id:string, host:any) => void) | null,
 *   foes?: (() => any[]) | null,
 *   foeHealth?: (() => number | null) | null,
 *   attack?: ((held:boolean) => void) | null,
 *   rearm?: (() => void) | null,
 *   plan?: ((from:number[], to:number[]) => number[][] | null) | null,
 *   sites?: (() => number[][]) | null,
 *   doors?: (() => Array<{ pos:number[], closed:boolean, locked:boolean, special:boolean }>) | null,
 *   travel?: (() => boolean) | null,
 *   applyPreset?: ((preset:object|null) => void) | null,
 *   build?: (() => string | null) | null,
 *   now?: () => number, document?: any,
 * }} deps Everything the run needs from the host it is wired into - questions the host already
 *   answers for its own HUD (where the feet are, which way the camera faces, how many townsfolk
 *   the pool holds). A dep this host is not given makes its leg a NAMED failure, never a guessed
 *   success.
 * @returns {{ tick:(dt:number, now:number)=>void, stop:()=>void, dispose:()=>void, surface:any, state:()=>string }}
 */
export function createBenchHost(deps) {
  const scene = deps.scene === 'dungeon' ? 'dungeon' : 'world';
  const asked = parseLegs(deps.params?.get('bench') || '');
  const playable = legsOf(scene).map((leg) => leg.id);
  const ids = asked.length ? asked.filter((id) => playable.includes(id)) : playable;
  const legs = ids.map((id) => BENCH_LEGS.find((leg) => leg.id === id));
  const asIs = deps.params?.get('benchpreset') === 'off';
  const doc = deps.document ?? globalThis.document;
  const clock = deps.now ?? (() => globalThis.performance?.now?.() ?? Date.now());
  /** How long a leg may wait for its scene to settle. A page with a stream keeps the town's own
   *  ceiling; a page that waits for one bake instead (`MESH_WAIT_MS`) must not hold a run for three
   *  minutes when the thing it waits for never arrives. */
  const settleCeiling = Number.isFinite(deps.settleCeilingMs) ? deps.settleCeilingMs : SETTLE_CEILING_MS;

  let state = 'running';
  let index = -1;
  let phase = 'idle';           // 'idle' | 'warmup' | 'measure'
  let phaseAt = 0;
  let stamps = [];
  let cursor = 0;               // the walk's waypoint cursor
  let swingAt = 0;              // when the next swing begins
  let arrivedAt = null;         // the stream leg's arrival: when the body was stood in the new place
  let sawBusy = false;         // the stream leg's witness: the journey actually started
  let runRoute = null;          // the street leg's route, planned once off the town's own grid
  let walk = null;              // the dungeon leg's route: the engine's own plan, followed waypoint by waypoint
  let walkCursor = 0;           // and how far along it the body has walked
  const walkSeen = [];          // the destinations this leg has been to - it does not go back to them
  let walkStillAt = 0;          // when the body last made progress, for the stuck watch - MILLISECONDS
  let walkStillPos = null;      // and where it stood then, so progress is a metre of new ground
  let walkLast = null;          // the last feet read, for the metres the leg covered
  let walkedM = 0;              // the metres the leg's body actually covered
  let walkedStuck = 0;          // how many times it abandoned a route and planned again
  let doorAt = 0;               // when the walk last pressed Activate at a door, so one door is not rattled
  let killsAt = null;           // an ARENA page's kills when the leg began - the proof a restocked ring needs
  let damageAt = null;          // a fight leg's foe health when it began, for the damage proof at its end
  let report = null;
  let bot = null;
  let inputLock = null;         // the release of the player's hands, held for the life of the run
  let prepared = false;         // the run's one-shot preparation has happened
  let bodyAt = NaN;             // when the run first looked for its character, for the wait's ceiling
  const run = [];               // the finished legs
  const failures = [];

  let surface = null;

  const card = doc && typeof doc.createElement === 'function'
    ? createBenchOverlay({ onExport: (text) => exportText(text), onClose: () => api.stop() })
    : null;

  /** The file a player gets: the card's own text, as a download. Nothing leaves the machine. */
  function exportText(text) {
    try {
      const win = globalThis.window;
      if (!win?.document || !globalThis.Blob || !globalThis.URL?.createObjectURL) return;
      const url = globalThis.URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      const a = doc.createElement('a');
      a.href = url;
      a.download = `benchmark-${scene}.txt`;
      a.click?.();
      globalThis.URL.revokeObjectURL?.(url);
    } catch { /* a browser that refuses a download still has the card and its Copy button */ }
  }

  /** THE ONE WRITE TO THE BODY, and it is the pool (see the header). Nothing heals it later. */
  function armTheBody() {
    const body = deps.entity?.();
    if (!body) return false;
    body.maxHealth = BENCH_VITAL.maxHealth;
    body.health = BENCH_VITAL.health;
    return true;
  }

  const vitalText = () => `health pool ${BENCH_VITAL.health} of ${BENCH_VITAL.maxHealth}`;
  /** The preset the run FORCED, or null when it did not force one - `asIs` by the player's ask, or
   *  a host that wires no setting door. Null is not a failure; it is the truth the card prints as
   *  "the player's own settings", and two runs must never be compared across it silently. */
  const presetForced = !asIs && typeof deps.applyPreset === 'function';
  const presetText = () => (presetForced ? Object.entries(BENCH_PRESET).map(([k, v]) => (v === true ? k : `${k} ${v}`)).join(', ') : null);

  function frameInfo() {
    try { return deps.renderer?.()?.frameInfo?.() ?? null; } catch { return null; }
  }

  function machineText() {
    const i = frameInfo();
    if (!i) return null;
    return [i.world ? `world ${i.world[0]}x${i.world[1]}` : null, i.canvas ? `canvas ${i.canvas[0]}x${i.canvas[1]}` : null,
      `dpr ${i.dpr ?? 1}`, `scale ${i.retro ? 'retro' : `${Math.round((i.scale ?? 1) * 100)}%`}`].filter(Boolean).join('  ');
  }

  /** The one-shot preparation, before any leg: the person's hands off the game and the tutorials
   *  off (both undone at the run's end, so the machine a person gets back is the one they left). */
  function prepare() {
    inputLock = installInputLock();
    forcePref('tutorialPopups', false);   // the page's own force (main.js sets it too, before any host); no shelf write, so nothing to put back but the force
    try { dismissTutorials(); } catch { /* a host with no tutorial cards */ }
    if (presetForced) deps.applyPreset(BENCH_PRESET);
  }

  /** THE CHARACTER, WAITED FOR AND THEN NAMED. `?class=` mints a body asynchronously on both doors,
   *  and a page measured before it lands films the character-creation wizard - the one thing a
   *  benchmark must never do. So the run WAITS for it (BODY_WAIT_MS, from the first frame the host
   *  ticks) and, if it never appears, fails by name. The first cut checked once, on the first frame:
   *  a machine busy with something else failed a run whose character was still arriving, which is a
   *  lie about the game. `chargenDone` is TRUE on a minted character and null or false while the
   *  wizard stands, so the test is the positive one - the first cut asked !== false, and a wizard
   *  whose flag was null walked straight past it (the dungeon page measured 220 draws of its panel). */
  function bodyReady() {
    try { const b = deps.entity?.(); return !b || b.chargenDone === true; } catch { return true; }
  }

  function begin() {
    if (!bodyReady()) {
      if (!Number.isFinite(bodyAt)) bodyAt = clock();
      if (clock() - bodyAt < BODY_WAIT_MS) return false;   // still minting: wait, measure nothing
      failures.push(`this page has no character after ${Math.round(BODY_WAIT_MS / 1000)} s - ?class= did not mint one on this door, so there is nothing to measure`);
      finish();
      return false;
    }
    if (!armTheBody()) failures.push('the body could not be given its health pool - a fight leg may end the run with a corpse');
    if (!legs.length) {
      failures.push(`no leg of this page was asked for - bench=${deps.params?.get('bench') ?? '(none)'} plays nothing here`);
      finish();
      return false;
    }
    index = 0;
    enter(legs[0].id);
    return true;
  }

  function enter(id) {
    const leg = legs.find((l) => l.id === id) ?? legs[index];
    // THE STREAM COMES FIRST, ON EVERY LEG BUT THE STREAM'S OWN. A town is streamed: its pixels,
    // its flats, its people and its lights arrive over the first seconds, and a leg measured
    // inside that window reports the loader's frame rate as the capital's - the one thing this
    // instrument exists not to do. The stream leg is the exception: its subject IS the wait.
    phase = leg.kind === 'stream' ? 'measure' : 'settle';
    phaseAt = clock();
    stamps = [];
    cursor = 0;
    swingAt = 0;
    walk = null;
    walkCursor = 0;
    // THE WALK'S OWN MEMORY IS PER LEG: the destinations visited, the metres covered and the times
    // a route was abandoned belong to the leg they were measured in, or a second leg's card would
    // report the first leg's walk.
    walkSeen.length = 0;
    walkLast = null;
    walkStillAt = 0;
    walkStillPos = null;
    walkedM = 0;
    walkedStuck = 0;
    stopHands();
    // any window the game raised between legs - the opening quest box, a tutorial page, a
    // level-up - holds the motor, and a leg under a modal measures a paused game
    try { deps.quiet?.(); } catch { /* a host with no windows: nothing to close */ }
    try { dismissTutorials(); } catch { /* no cards */ }
    // THE TOWN'S CENTRE, not the road outside it: the crowd and the street are measured where the city
    // is busiest, and the player was being left wherever the start marker put them.
    if (id === 'crowd' || id === 'street') { try { deps.goTo?.(deps.centre?.()); } catch { /* a host with nowhere to stand */ } }
    try { deps.prepareLeg?.(id, api); } catch (err) { failures.push(`${leg.title}: the scene could not be prepared (${err?.message ?? err})`); }
    // A FIGHT LEG'S PROOF OF A FIGHT: the foes' health as the leg found it. A leg that swings for
    // twenty seconds and takes nothing off that number measured a body flailing, not combat, and
    // says so at its end (see `endLeg`).
    killsAt = FIGHT_IDS.includes(leg.id) && typeof deps.arenaKills === 'function' ? deps.arenaKills() : null;
    damageAt = FIGHT_IDS.includes(leg.id) && typeof deps.foeHealth === 'function' ? readFoeHealth() : null;
    card?.progress?.(id, 0);
  }

  /** The foes' total health, or null when this host has none to read. */
  function readFoeHealth() {
    try { const n = deps.foeHealth?.(); return Number.isFinite(n) ? n : null; } catch { return null; }
  }

  /** The dungeon's own floor as places to walk to - one centre per navmesh polygon, from the page that
   *  baked it (`deps.sites`). A page that wires none answers [], and the walk falls back to its foes
   *  exactly as it used to; a page whose bake threw answers the same, because a walk that has no
   *  places to ask about is a leg that says so, not a run that dies on a query. */
  function readSites() {
    try { const s = deps.sites?.(); return Array.isArray(s) ? s : []; } catch { return []; }
  }

  function censusOf(leg) {
    const key = leg.census?.key ?? 'scene';
    const read = (k) => { try { return deps.census?.(k) ?? null; } catch { return null; } };
    const value = read(key);
    // THE LEG'S REQUIRED FACT, AND THE CROWD BESIDE IT. A streamed town whose population the game
    // itself left empty still measured a real frame on a real street - so the leg is scored on its
    // structural fact (the town is built) and the crowd is REPORTED next to it. That is how the
    // first real run's finding (pool 0, max 96, 650 draws) came to be visible at all.
    return key === 'people' || key === 'pixels' ? { [key]: value, people: read('people') } : { [key]: value };
  }

  function endLeg() {
    const leg = legs[index];
    const s = summarise(stamps, { seconds: leg.kind === 'stream' ? null : leg.seconds });
    const census = censusOf(leg);
    const judged = censusOk(census, leg.census);
    const entry = {
      id: leg.id, title: leg.title, kind: leg.kind, scene: leg.scene,
      seconds: s.seconds, frames: s.frames, fps: s.fps, meanMs: s.meanMs, minMs: s.minMs,
      p50Ms: s.p50Ms, p95Ms: s.p95Ms, p99Ms: s.p99Ms, worstMs: s.worstMs, lowFps: s.lowFps,
      scriptMs: null, scriptWorstMs: null, gpuMs: null, draws: null, binds: null,
      census, notes: [],
    };
    // the counter's own numbers, read once at the leg's end: the same instrument a player's
    // screenshot shows, so a leg and a player's report can be compared by eye
    try {
      const st = globalThis.window?.__fpsStats?.();
      if (st) {
        entry.scriptMs = st.scriptMs ?? null;
        entry.scriptWorstMs = st.scriptWorstMs ?? null;
        entry.draws = st.draws ?? null;
        entry.binds = st.binds ?? null;
        entry.notes.push(`the counter read ${st.fps ?? '?'} fps`);
      }
    } catch { /* no counter: the leg still has its own stamps */ }
    // THE DAMAGE PROOF. Two runs of a fight leg must be comparable, and a leg whose blows never
    // landed measured idle frames. So the foes' health is read again and the drop is REPORTED; a
    // leg that took nothing off it is a named failure, because a benchmark cannot call that combat.
    // AN ARENA LEG IS PROVED BY ITS KILLS. The ring is restocked as it falls, so the foes' summed health
    // cancels itself out (a rat dies for -57, another stands for +57); the count of the fallen does not.
    if (killsAt !== null) {
      const kills = deps.arenaKills();
      entry.kills = kills - killsAt;
      if (entry.kills > 0) entry.notes.push(entry.kills + " rat(s) killed by the leg own blows");
      if (!(entry.kills > 0)) failures.push(leg.title + ": no rat was killed - the leg swung and nothing it hit went down, so this measured a body flailing, not combat");
    } else if (damageAt !== null) {
      const now = readFoeHealth();
      const dealt = now === null ? null : Math.max(0, damageAt - now);
      entry.damage = dealt;
      if (dealt !== null) entry.notes.push(`${dealt} point(s) of foe health taken by the leg's own blows`);
      if (dealt === 0) failures.push(`${leg.title}: the leg swung and no blow landed - nothing was taken off the foes' health, so this measured a body flailing, not combat`);
    }
    if (leg.id === 'dungeon') {
      // THE WALK'S OWN PROOF: the ground the body covered, and how often it had to abandon a route.
      // A leg that covers less than WALK_MIN_M in its whole window was turning on the spot, or pinned
      // against a jamb, for every frame of it - a walk that went nowhere, and a failure rather than a
      // note (the old rule asked only for more than zero metres, which a body shuffling in a doorway
      // passes).
      entry.walked = Math.round(walkedM * 10) / 10;
      if (walkedStuck) entry.notes.push(`${walkedStuck} route(s) abandoned as pinned`);
      if (walkedM >= WALK_MIN_M) entry.notes.push(`the body covered ${entry.walked} m`);
      else failures.push(`${leg.title}: the body covered ${entry.walked} m of the dungeon in ${leg.seconds} s - under the ${WALK_MIN_M} m a walked dungeon owes, so this measured a body turning (or pinned) instead of a walk`);
    }
    if (!s.frames) failures.push(`${leg.title}: no frame was measured - the leg held ${stamps.length} stamp(s)`);
    if (!judged.ok) failures.push(`${leg.title}: ${judged.why}`);
    run.push(entry);
    card?.done?.(leg.id);
    index++;
    if (index >= legs.length) return finish();
    return enter(legs[index].id);
  }

  /** Give the machine back: the hands, and the page's forced tutorial switch. Called on every end -
   *  the run's own, a failure's, and a Close - so a person is never locked out of their game. Nothing
   *  is written to the shelf anywhere in here, so there is nothing of the player's to restore. */
  function handBack() {
    try { inputLock?.(); } catch { /* a listener already gone */ }
    inputLock = null;
    clearForcedPref('tutorialPopups');
  }

  function finish() {
    const summary = scoreOf(run.map((leg) => ({ id: leg.id, lowFps: leg.lowFps })));
    const offered = legs.map((leg) => leg.id);
    const missing = [...new Set([...summary.missing, ...offered.filter((id) => !run.some((l) => l.id === id))])];
    report = {
      at: new Date().toISOString(), scene,
      gpu: frameInfo()?.gpu ?? null, size: machineText(), build: deps.build?.() ?? null,
      preset: presetText(), vital: vitalText(), input: 'the player\'s hands are locked out', tutorials: 'off',
      legs: run, score: summary.score, grade: summary.grade, missing,
      failures: [...failures],
    };
    state = failures.length ? 'failed' : 'done';
    stopHands();
    handBack();
    card?.finish?.(report);
    return report;
  }

  /** EVERY END LETS THE HANDS GO - the keys AND the attack. A fight leg that finished mid-swing
   *  would otherwise leave the host holding the mouse button: the next leg, or the player who comes
   *  back after the run, would find a body swinging at nothing with no hand on it. */
  function stopHands() {
    bot?.stop();
    try { deps.attack?.(false); } catch { /* a host with no attack door */ }
  }

  /** The walk keys, pressed from the bindings the player has, or a named failure - a benchmark
   *  that pressed a key of its own while the player had rebound Walk Forward would measure
   *  nothing, quietly, on that player's machine only. `activateCode` is the player's own
   *  ActivateCenterObject, kept here because the walk's doors are pressed with it. */
  let activateCode = null;
  function hands() {    if (bot) return bot;
    const codes = deps.codes?.() ?? null;
    if (!codes?.forward || !codes?.swing) return null;
    activateCode = typeof codes.activate === 'string' ? codes.activate : null;
    bot = createBenchBot({ codes, press: (c) => deps.press?.(c), release: (c) => deps.release?.(c), look: (r) => deps.turnBy?.(r) });
    return bot;
  }

  /** THE DOOR THE WALK IS STANDING AT, opened the way a person opens one: the closed, unlocked door
   *  within reach and in front is looked at, and the player's own Activate binding is pressed. The page
   *  answers which doors are near (`deps.doors`, world/actionSystem's own door spots); a locked or
   *  special one is never pressed, and never needs to be - the navmesh keeps those as walls, so no route
   *  crosses one. Answers the door, or null. */
  function doorInTheWay(at, h, now) {
    if (!activateCode || typeof deps.doors !== 'function') return null;
    let spots = null;
    try { spots = deps.doors(); } catch { spots = null; }
    if (!Array.isArray(spots)) return null;
    let best = null;
    let bestD = DOOR_OPEN_M;
    for (const s of spots) {
      if (!s || !s.closed || s.locked || s.special) continue;   // open, locked, or a wall that swings: not ours
      const p = s.pos;
      if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[2])) continue;
      const d = distanceTo(at, p);
      if (d > bestD) continue;                                   // the nearer one is the one in the way
      if (Math.abs(wrapAngle(bearingTo(at, p) - h)) > DOOR_FACE_RAD) continue;   // behind the shoulder
      best = s;
      bestD = d;
    }
    if (!best) return null;
    if (now - doorAt >= DOOR_PRESS_MS) {
      doorAt = now;
      bot?.tap(activateCode, now, READY_HOLD_MS);
    }
    return best;
  }

  /** One leg's frame: the walk, the crowd's sweep, or the ring of foes - each through the game's
   *  own inputs. Returns a failure sentence when the leg cannot be played at all. */
  function playLeg(leg, dt, at, h) {
    const b = hands();
    if (!b) return 'the player\'s own bindings could not be read, so the bot has no hands (systems/inputActions.js codeForAction)';
    if (leg.id === 'street') {
      // THE ROUTE IS PLANNED IN THE GAME, once a run, off the town's own navigation grid
      // (`deps.route`, systems/bench/route.js) - so the leg a person most wants to watch no longer
      // waits for a route file another machine wrote. An authored track is the fallback for a host
      // that cannot plan one, and `tools/benchTracks.mjs` still writes those.
      if (!runRoute) {
        let planned = null;
        try { planned = deps.route?.() ?? null; } catch { planned = null; }
        runRoute = Array.isArray(planned) && planned.length > 1 ? planned : (BENCH_TRACKS?.Daggerfall ?? null);
      }
      const track = runRoute;
      const ok = track ? validateTrack(track) : { ok: false, why: 'the town offered nowhere to walk (no navigation grid where the player stands) - `npm run tracks --headed` can author a route instead' };
      if (!ok.ok) return ok.why;
      const next = nextWaypoint(track, at, cursor);
      cursor = next.index;
      if (!next.done) b.steer({ at, heading: h, target: next.target, dt });
      return null;
    }
    if (leg.id === 'dungeon') {
      // THE DUNGEON WALKED, ROOM TO ROOM, ON THE DUNGEON'S OWN MESH. A corridor is not a straight
      // line: the first real run held forward and walked into the first wall it met, and reported the
      // wall's frame rate as the dungeon's. So the walk is a ROUTE - the engine's own `findPath` over
      // the same navmesh the foes path on (`deps.plan`) - taken to a destination that is actually
      // reachable and followed waypoint by waypoint. The route turns where the corridor turns, because
      // the mesh's own funnel does.
      //
      // AND THE WALK KEEPS GOING SOMEWHERE NEW. The second watch: "in the dungeon the guy isn't going
      // through the dungeon... navigate, walk, go into rooms, turn around". Three causes, all fixed
      // here: the destinations were EVERY FOE and nothing else, so the leg walked to the two rats the
      // fight legs had just left standing two metres away and back again - the floor it was supposed to
      // cross was never a destination at all; a plan that ended where the body had just come from was
      // taken again; and a body the collider pinned (a door jamb, a stair nose) re-planned to the same
      // place for ever. Now the floor's own places are the destinations (`deps.sites`: one centre per
      // navmesh polygon, farthest first and spread across the dungeon), a destination is remembered
      // (`WALK_VISITED_M`), and a body that stops moving re-plans at once.
      if (!walk) {
        const plan = deps.plan ?? null;
        if (!plan) return 'this page offers no dungeon route (its host wired no navmesh plan), so the walk has nowhere to be planned';
        const sites = readSites();
        const foes = (deps.foes?.() ?? []).map((f) => foeFeet(f)).filter(Boolean);
        const ask = (seen) => walkGoals({ sites, foes, seen, from: at, visitedM: WALK_VISITED_M });
        let goals = ask(walkSeen);
        // EVERY DESTINATION THIS LEG HAS BEEN TO: forget the memory and cross the dungeon again rather
        // than stand still - a dungeon of a few rooms has fewer places than a leg has seconds.
        if (!goals.length) { walkSeen.length = 0; goals = ask(walkSeen); }
        try { walk = pickWalk({ plan, from: [...at], goals }); } catch (err) {
          return `the dungeon's own path query refused to answer (${err?.message ?? err}) - nothing to walk on`;
        }
        if (!walk) {
          // TWO DIFFERENT TRUTHS, NAMED APART: a mesh that never landed (the page can say - its own
          // `navReady`) is not a mesh with no way across the floor, and a reader who is told the
          // wrong one chases the wrong bug.
          const meshHere = typeof deps.navReady === 'function' ? !!deps.navReady() : true;
          return meshHere
            ? `the dungeon offered no route to walk (${goals.length} destination(s) tried) - the navmesh its foes path over does not reach this body's floor`
            : 'the dungeon\'s navmesh never landed (no foe AI answered one), so the walk had no floor to be planned on';
        }
        if (walk.goal) walkSeen.push(walk.goal);
        walkCursor = 0;
        walkStillAt = clock();
        walkStillPos = [...at];
        walkLast = [...at];
      }
      // A TIGHT WAYPOINT, as the dungeon's own foe AI follows its route (`WP_REACH` 0.45 m there): a
      // loose one cuts the corner of a corridor and walks the body into the wall it cut.
      const step = advancePath(walk.points, walkCursor, at, WALK_WAYPOINT_M);
      walkCursor = step.index;
      // THE METRES THE BODY ACTUALLY COVERED - the reading that says the walk went somewhere instead
      // of turning on the spot, the number the leg's notes carry, and the leg's own proof at its end.
      const movedNow = walkLast ? distanceTo(walkLast, at) : 0;
      if (movedNow < 3) walkedM += movedNow;   // (a jump is a warp, not a step: it is not counted)
      walkLast = [...at];
      // STUCK WATCH: a body that has not found WALK_PROGRESS_M of new ground in WALK_STUCK_MS is pinned
      // - a door jamb, a stair nose, a crate, a rat in the doorway - and not walking. Plan again from
      // here rather than spend the leg against it. (The watch is set in METRES and MILLISECONDS, not in
      // metres a frame: the old one compared a point with a point and never fired at all, and a
      // per-frame threshold fails a machine whose walk is real but slow.)
      if (distanceTo(walkStillPos, at) > WALK_PROGRESS_M) { walkStillPos = [...at]; walkStillAt = clock(); }
      if (clock() - walkStillAt > WALK_STUCK_MS) {
        walkedStuck++;
        walk = null;
        walkStillAt = clock();
        walkStillPos = [...at];
        return null;
      }
      if (step.done) { walk = null; return null; }   // the route is behind us: plan the next one
      // AND THE DOOR IN THE WAY IS THE WALK'S OWN TO OPEN. The navmesh leaves an unlocked action door out
      // of the wall it bakes - the door is one its own foes walk through - so the route crosses a shut
      // door and the body walks its nose into the panel. So: look at the door, press the player's own
      // Activate binding, and let the host's PlayerActivate open it. The tap is released by the bot's own
      // tick, so nothing is left held.
      const door = doorInTheWay(at, h, clock());
      if (door) { try { deps.aimAt?.([door.pos[0], door.pos[1], door.pos[2]]); } catch { /* a look that refused */ } }
      b.tick(clock());
      // AND THE SAME REACH IS THE ONE THE BOT WALKS BY. `advancePath` leaves a waypoint behind at
      // WALK_WAYPOINT_M, so the steerer must count it arrived at the same metre: the track's own 2.5 m
      // made the body stand two and a half metres short of every corner the walk was still steering at,
      // which arrived at nothing and spent the leg waiting for a route it never left.
      if (step.target && !door) b.steer({ at, heading: h, target: step.target, dt, withinRad: WALK_FACE_RAD, reach: WALK_WAYPOINT_M });
      // A WALKER LOOKS WHERE IT IS GOING. Whatever pitch the last fight aimed with is not a corridor's
      // - the owner watching the dungeon leg: "also stop looking up". A DOOR IN THE WAY KEEPS THE LOOK
      // IT WAS GIVEN, though: the activation ray starts at the eye and goes where the camera looks, so
      // levelling the pitch would fire the press over the door's top.
      if (!door) { try { deps.level?.(); } catch { /* a host with no level look */ } }
      return null;
    }
    if (leg.id === 'crowd') {
      b.stop();
      deps.turnBy?.(SWEEP_RAD_S * dt);
      return null;
    }
    // THE STREAM LEG PRESSES NOTHING: its subject is the journey's own settle, and a leg that also
    // walked or swung would measure two things at once (it used to fall through to the fight branch
    // and swing at a page with no foes at all).
    if (!FIGHT_IDS.includes(leg.id)) return null;
    // blade, bow, spell: THE ARENA. The body stands on ONE floor for all three legs and STAYS there - it
    // turns its head and swings, it does not walk (the owner: "all the fighting dungeons should be same
    // space, character can't move its location, it can look at enemies, always have spawned two rats at
    // the time"). Two rats are kept alive in front of it, restocked as they fall, and every leg fights
    // exactly that: the same room, the same two foes, one weapon different each time - which is what
    // makes the three legs comparable at all.
    const foes = deps.foes?.() ?? [];
    if (!deps.spawnRat) {
      // a page with no arena spawner cannot keep the ring, so the leg says so rather than measuring a
      // fight against whatever the layout happened to place
      return 'this page offers no arena spawner (its host wired no spawnRat), so the ring cannot be stood';
    }
    try { deps.restockArena?.(h, at); } catch { /* a page whose arena refused */ }
    // THE RING, NEVER THE LAYOUT. A layout foe the body cannot see - a wall between them - is a leg that
    // casts into the stone, which is what a person watching saw: "archer and magic only stare at the floor
    // and cast stuff". The arena stands its own four, in its own two ranks, and when it stands none the
    // leg says so by name rather than aiming at whatever the level happened to place.
    // ARM'S LENGTH IS THE BLADE'S: a swing reaches 2.5 m and nothing else does. A bow's shaft spawns at
    // the bow and a spell leaves the eye, so both fight the FAR rank - which is also what stops the mage
    // "staring at the floor": a rat at arm's length is a look pitched 30 degrees down.
    const want = leg.id === 'blade' ? 'near' : 'far';
    const foe = typeof deps.arenaFoe === 'function' ? deps.arenaFoe(at, want) : nearestFoe(foes, at, ARENA_KEEP_M);
    if (!foe) {
      return `no rat is standing in the ring (${foes.length} foe(s) in the dungeon, none of the arena's within ${ARENA_KEEP_M} m) - the spawner did not answer`;
    }
    const feet = foeFeet(foe);
    // A WEAPON THAT NEVER CAME OUT IS NOT A MISS. The rig refuses every blow behind `sheathed`, so a
    // leg whose draw was refused swings nothing at all - and "no blow landed" would send a reader
    // looking at reach and aim when the real answer is that the hand was empty.
    if (leg.id !== 'spell' && typeof deps.drawn === 'function' && !deps.drawn()) {
      return `its weapon never came out of its sheath - the rig refused all ${DRAW_TRIES} draw attempts, so every press was a blow at nothing`;
    }
    // AIM, DON'T JUST TURN: a missile leaves along the camera's forward vector, so the PITCH matters as
    // much as the yaw - a level look at a rat whose mid-capsule is below the eye looses the arrow over
    // its head. The host's own look door sets both; a host without one gets the incremental yaw turn.
    if (typeof deps.aimAt === 'function') {
      try { deps.aimAt(foeCentre(foe) ?? feet); } catch { /* a host whose look refused */ }
    } else {
      const delta = turnTo(aimYaw(at, feet), h);
      if (Math.abs(delta) > 0.1) deps.turnBy?.(Math.max(-0.12, Math.min(0.12, delta)));
    }
    // ROOTED: the body looks and swings, and never translates. `b.stop()` is the bot letting go of every
    // movement key, which is the only way a fight leg can promise it measured combat and not walking.
    b.stop();
    b.tick(clock());
    // THE CADENCE IS A CADENCE, AND THE SPELL'S IS SLOWER. A bow's draw is longer than a swing; a
    // caster's is slower again, because a cast costs mana and the ready has to be re-made before the
    // next one - the owner, watching: "in the mage put a timeout between spells, it's spamming too
    // much". One rhythm per weapon, named here rather than tuned in three places.
    const hold = leg.id === 'bow' ? BOW_DRAW_MS : leg.id === 'spell' ? SPELL_HOLD_MS : SWING_MS;
    const every = leg.id === 'bow' ? hold + 300
      : leg.id === 'spell' ? SPELL_EVERY_MS
        : hold + (SWING_EVERY_MS - SWING_MS);
    // EACH BLOW IS ARMED BEFORE IT IS PRESSED. A readied spell is SPENT by its cast, so a leg that
    // readied one spell at its start threw one spell and then fought with an empty hand for the rest
    // of its twenty seconds - one whiffed cast and the leg proves nothing. The host owns what
    // "arming" means for the weapon in hand (`deps.rearm`: the spell leg's is a ready, and a blade's
    // is nothing at all); a host with no such door is unaffected.
    if (clock() >= swingAt) {
      try { deps.rearm?.(); } catch { /* a host whose arming refused: the blow still swings */ }
      b.startSwing(clock(), hold);
      swingAt = clock() + every;
    }
    // THE DOOR IS HELD FOR AS LONG AS THE SWING IS, and it has to be: a drawn bow needs the button
    // still down to reach its release, and the cast engine arms a click and fires it on a LATER frame
    // (`interceptAttack` sets a pending cast; `firePending` casts it). An EDGE alone - one press, one
    // release - was tried on the owner's ask about the mage, and it took BOTH ranged legs down: the
    // arrow never loosed and the cast never fired. So the state stands. What stops the mage spamming
    // is the CADENCE (a cast every SPELL_EVERY_MS, not a cast a frame) plus the engine's own guard: a
    // click is consumed only while a spell is readied, and casting spends the ready.
    deps.attack?.(!!b.swinging);
    return null;
  }

  const api = {
    /** Called once a frame by the host that wired it. `now` is the frame's rAF stamp - the same
     *  beat `fpsCounter` measures - so a leg's stamps and the counter's numbers share a clock. */
    tick(dt, now) {
      const at = Number.isFinite(now) ? now : clock();
      if (state !== 'running') return;
      if (index < 0) {
        if (!prepared) { prepared = true; prepare(); }   // the hands and the tutorials, once per run
        if (!begin() || state !== 'running') return;      // the character may still be minting
      }
      const leg = legs[index];
      if (!leg) return;
      if (phase === 'settle') {
        // the stream's own test (this host's `__streamIdle`): the queue empty, nothing building,
        // nothing in flight. A host with no stream says so by answering true.
        const idle = deps.settle ? !!deps.settle() : true;
        if (idle || at - phaseAt >= settleCeiling) { phase = 'warmup'; phaseAt = at; stamps = []; }
        return;
      }
      if (phase === 'warmup') {
        if (at - phaseAt >= toMs(leg.warmupSeconds)) { phase = 'measure'; phaseAt = at; stamps = []; }
        return;
      }
      if (phase !== 'measure') return;
      stamps.push(at);
      const feet = (() => { try { return deps.feet?.() ?? [0, 0, 0]; } catch { return [0, 0, 0]; } })();
      const heading = (() => { try { return deps.heading?.() ?? 0; } catch { return 0; } })();
      const trouble = playLeg(leg, Math.max(0, Number(dt) || 0), feet, heading);
      if (trouble) { failures.push(`${leg.title}: ${trouble}`); return finish(); }
      if (leg.kind === 'stream') {
        // MEASURED TO THE SETTLE - once the journey has actually STARTED. `settle()` is true of a
        // stream that never left, so the leg must witness the stream BUSY before an idle stream may
        // end it, and it holds a window long enough to be seen (STREAM_MIN_MS): the first real run
        // ended this leg in three frames over a journey that never opened, and reported 7 fps over
        // a second and a half nobody could watch.
        if (stamps.length === 1 && typeof deps.travel === 'function') {
          let moved = false;
          try { moved = deps.travel() !== false; } catch { moved = false; }
          if (!moved) {
            failures.push(`${leg.title}: the world could not open a journey (nowhere discovered to travel to, or the builder refused)`);
            return finish();
          }
        }
        // AND THE BODY GOES WITH IT. The second watch: "the stream didn't do nothing, happen" - the
        // leg built the pixel next door and left the camera where it stood, so a person watching saw
        // a town they already knew. Once the new place has settled the body is STOOD IN IT (its own
        // centre, through the host's warp), which is the arrival the leg is named for; the stream
        // that follows is measured too, and the leg cannot end until the arrival has been watched for
        // STREAM_LAND_MS.
        if (sawBusy && arrivedAt === null && deps.settle?.()) {
          let landed = false;
          try { landed = deps.goTo?.(deps.centre?.()) !== false; } catch { landed = false; }
          if (landed) arrivedAt = at;
        }
        if (!deps.settle?.()) sawBusy = true;
        const held = at - phaseAt;
        const watched = arrivedAt === null ? 0 : at - arrivedAt;
        if (sawBusy && arrivedAt !== null && deps.settle?.() && held >= STREAM_MIN_MS && watched >= STREAM_LAND_MS) return endLeg();
        if (held >= toMs(leg.seconds)) {
          failures.push(sawBusy
            ? `${leg.title}: the stream never settled in ${leg.seconds} s`
            : `${leg.title}: the stream never started - the journey opened no queue to wait on`);
          return finish();
        }
        return;
      }
      card?.progress?.(leg.id, Math.min(1, (at - phaseAt) / toMs(leg.seconds)));
      if (at - phaseAt >= toMs(leg.seconds)) endLeg();
    },
    /** The run's own stop, for the card's Close and for the CLI's teardown. */
    stop() {
      stopHands();
      if (state === 'running') {
        failures.push('the run was stopped before it finished');
        finish();
      }
    },
    dispose() {
      stopHands();
      handBack();
      card?.dispose?.();
      const w = globalThis.window;
      if (w && w.__bench === surface) delete w.__bench;
    },
    surface: null,
    state: () => state,
  };

  surface = {
    version: 1,
    scene,
    legs: [...ids],
    get state() { return state; },
    get leg() { return state === 'running' ? (legs[index]?.id ?? null) : null; },
    get progress() {
      const leg = legs[index];
      if (!leg || phase !== 'measure') return 0;
      return Math.min(1, (clock() - phaseAt) / toMs(leg.seconds));
    },
    get report() { return report; },
    get failures() { return [...failures]; },
    text: () => (report ? reportLines(report).join('\n') : ''),
    stop: () => api.stop(),
  };
  api.surface = surface;
  if (globalThis.window) globalThis.window.__bench = surface;

  if (card) card.prepare(legs.map((leg) => ({ id: leg.id, title: leg.title })));

  return api;
}
