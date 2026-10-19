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
import { nextWaypoint, trackLength, validateTrack } from '../systems/bench/track.js';
import { BENCH_TRACKS } from '../systems/bench/tracks.js';
import { createBenchOverlay, reportLines } from '../ui/benchOverlay.js';
import { installInputLock } from '../systems/bench/lock.js';   // BENCH1: the player's hands off the game while the run is live
import { tutorialPopupsOn, setTutorialPopups } from '../systems/tutorials.js';   // BENCH1: the tutorials off, as the owner asked - a popup mid-leg holds the motor
import { testGearRows, testItemOf, testMissileSpells, addTestMissileSpells } from '../systems/testRoom.js';   // BENCH1: the combat kit is the Test Room's (Home.md: one exports, the other imports)

/** How long a swing is held, and how often the next begins. One rhythm for all three weapons:
 *  the host's own ladder decides which system answers the press. */
export const SWING_MS = 420;
export const SWING_EVERY_MS = 700;
/** How fast the crowd leg turns the view, radians a second - a look around, not a spin. */
export const SWEEP_RAD_S = 0.35;
/** How near a foe is the one being fought, metres. Further than this and the leg walks first. */
export const FOE_REACH_M = 25;
/** How far ahead the dungeon leg walks when there is no route to follow, metres. */
export const DUNGEON_AHEAD_M = 6;

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
    travel: host.travel ?? null,
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

/** The nearest live foe to `at`, in the shape `deps.foeAt` answers - null when none is in reach.
 *  A dungeon's foes carry their own x/y/z (dungeonContext's own record); a pool that carries a
 *  `pos` is read the same way. */
export function nearestFoe(foes, at, reach = FOE_REACH_M) {
  let best = null;
  let bestD = reach;
  for (const f of foes ?? []) {
    if (!f || f.dead) continue;
    const p = f.pos ?? f;
    const dx = (p.x ?? p[0]) - at[0];
    const dz = (p.z ?? p[2]) - at[2];
    const d = Math.hypot(dx, dz);
    if (d < bestD) { bestD = d; best = [p.x ?? p[0], (p.y ?? p[1]) ?? at[1], p.z ?? p[2]]; }
  }
  return best;
}

/**
 * The dungeon page's benchmark. Its legs are the dungeon walked and the same ring of foes fought
 * three ways, and the three ways are ARMED HERE from the Test Room's own producers - never from a
 * second item table: `testGearRows`/`testItemOf` for the bow and its quiver, `addTestMissileSpells`
 * for something that flies. The press is ONE press for all three (`magic.interceptAttack` first,
 * then `weaponRig.attackInput`), which is why nothing below touches the swing.
 * @param {{
 *   params: URLSearchParams, feet: () => number[], heading: () => number,
 *   turnBy: (rad:number) => void, entity: () => any, renderer?: (() => any) | null,
 *   foes: () => any[], bindings: () => any, codeForAction: (store:any, action:string) => string | null,
 *   spellsByIndex?: (() => any) | null, setReadied?: ((spell:any) => void) | null,
 *   equip?: ((item:any) => void) | null, document?: any,
 * }} host
 */
export function createDungeonBench(host) {
  const armGear = (id) => {
    const body = host.entity?.();
    if (!body) return;
    if (id === 'bow') {
      const rows = testGearRows(body.gender);
      const bow = rows.find((r) => r.kind === 'weapon' && /bow/i.test(String(r.label ?? '')));
      if (bow && host.equip) host.equip(testItemOf(bow));
    }
    if (id === 'spell') {
      const index = host.spellsByIndex?.() ?? null;
      addTestMissileSpells(body, index);
      const flier = testMissileSpells(index)[0] ?? null;
      if (flier && host.setReadied) host.setReadied(flier);
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
      return { forward: of('MoveForwards'), run: of('Run'), swing: of('SwingWeapon') };
    },
    entity: host.entity,
    renderer: host.renderer ?? null,
    settle: () => true,   // a dungeon is built whole at boot: there is no stream to wait for
    census: (key) => (key === 'foes' ? (host.foes?.()?.length ?? 0) : null),
    prepareLeg: (id) => armGear(id),
    foeAt: () => nearestFoe(host.foes?.() ?? [], host.feet?.() ?? [0, 0, 0]),
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
 *   codes: () => { forward?:string, run?:string, swing?:string } | null,
 *   entity: () => any, renderer?: (() => any) | null,
 *   settle?: (() => boolean) | null,
 *   census?: ((key:string) => number | null) | null,
 *   prepareLeg?: ((id:string, host:any) => void) | null,
 *   foeAt?: (() => number[] | null) | null,
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

  let state = 'running';
  let index = -1;
  let phase = 'idle';           // 'idle' | 'warmup' | 'measure'
  let phaseAt = 0;
  let stamps = [];
  let cursor = 0;               // the walk's waypoint cursor
  let swingAt = 0;              // when the next swing begins
  let sawBusy = false;         // the stream leg's witness: the journey actually started
  let report = null;
  let bot = null;
  let inputLock = null;         // the release of the player's hands, held for the life of the run
  let tutorialWas = null;       // the tutorial pref as it stood before the run, put back at its end
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

  function begin() {
    // THE PERSON IS OUT OF THE GAME, AND THE TUTORIALS ARE OFF (the owner's ask, 2026-10-19: "all
    // the user input will be disabled until the benchmark end", "need disable tutorial"). Both are
    // undone when the run ends, so the machine a person gets back is the one they left - the
    // tutorial pref included, and the pointer lock given back by the browser's own gesture.
    inputLock = installInputLock();
    tutorialWas = tutorialPopupsOn();
    setTutorialPopups(false);
    if (presetForced) deps.applyPreset(BENCH_PRESET);
    // A CHARACTER-CREATION SCREEN IS NOT A SCENE. The standalone dungeon host does not mint its
    // character from ?class= on this build (reproduced with no benchmark on the page at all), so
    // the fights would have been measured over a wizard - the one thing a benchmark must never do
    // is film a login screen and call it a frame. It fails by name instead.
    // chargenDone is TRUE on a minted character and null or false while the wizard stands, so the
    // test is the positive one - the first cut asked !== false, and a wizard whose flag is null
    // walked straight past it (the dungeon page measured 220 draws of its own panel).
    const bodyUp = (() => { try { const b = deps.entity?.(); return !b || b.chargenDone === true; } catch { return true; } })();
    if (!bodyUp) {
      failures.push('this page has no character - the character-creation screen is up (?class= does not mint one on the dungeon door in this build), so there is nothing to measure');
      return finish();
    }
    if (!armTheBody()) failures.push('the body could not be given its health pool - a fight leg may end the run with a corpse');
    if (!legs.length) {
      failures.push(`no leg of this page was asked for - bench=${deps.params?.get('bench') ?? '(none)'} plays nothing here`);
      return finish();
    }
    index = 0;
    enter(legs[0].id);
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
    bot?.stop();
    // any window the game raised between legs - the opening quest box, a tutorial page, a
    // level-up - holds the motor, and a leg under a modal measures a paused game
    try { deps.quiet?.(); } catch { /* a host with no windows: nothing to close */ }
    try { deps.prepareLeg?.(id, api); } catch (err) { failures.push(`${leg.title}: the scene could not be prepared (${err?.message ?? err})`); }
    card?.progress?.(id, 0);
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
    if (!s.frames) failures.push(`${leg.title}: no frame was measured - the leg held ${stamps.length} stamp(s)`);
    if (!judged.ok) failures.push(`${leg.title}: ${judged.why}`);
    run.push(entry);
    card?.done?.(leg.id);
    index++;
    if (index >= legs.length) return finish();
    return enter(legs[index].id);
  }

  /** Give the machine back: the hands, and the tutorials as they were. Called on every end -
   *  the run's own, a failure's, and a Close - so a person is never locked out of their game. */
  function handBack() {
    try { inputLock?.(); } catch { /* a listener already gone */ }
    inputLock = null;
    if (tutorialWas !== null) { try { setTutorialPopups(tutorialWas); } catch { /* a store that refused the write */ } tutorialWas = null; }
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
    bot?.stop();
    handBack();
    card?.finish?.(report);
    return report;
  }

  /** The walk keys, pressed from the bindings the player has, or a named failure - a benchmark
   *  that pressed a key of its own while the player had rebound Walk Forward would measure
   *  nothing, quietly, on that player's machine only. */
  function hands() {
    if (bot) return bot;
    const codes = deps.codes?.() ?? null;
    if (!codes?.forward || !codes?.swing) return null;
    bot = createBenchBot({ codes, press: (c) => deps.press?.(c), release: (c) => deps.release?.(c), look: (r) => deps.turnBy?.(r) });
    return bot;
  }

  /** One leg's frame: the walk, the crowd's sweep, or the ring of foes - each through the game's
   *  own inputs. Returns a failure sentence when the leg cannot be played at all. */
  function playLeg(leg, dt, at, h) {
    const b = hands();
    if (!b) return 'the player\'s own bindings could not be read, so the bot has no hands (systems/inputActions.js codeForAction)';
    if (leg.id === 'street') {
      const track = BENCH_TRACKS?.Daggerfall ?? null;
      const ok = track ? validateTrack(track) : { ok: false, why: `no track is authored for Daggerfall - tools/benchTracks.mjs writes one` };
      if (!ok.ok) return ok.why;
      const next = nextWaypoint(track, at, cursor);
      cursor = next.index;
      if (!next.done) b.steer({ at, heading: h, target: next.target, dt });
      return null;
    }
    if (leg.id === 'dungeon') {
      // no route is authored for a dungeon yet: the walk is a walk - straight ahead along the
      // camera, through the dungeon's own collider, which is what a player does in a room
      const ahead = [at[0] + Math.sin(h) * DUNGEON_AHEAD_M, at[1], at[2] + Math.cos(h) * DUNGEON_AHEAD_M];
      b.steer({ at, heading: h, target: ahead, dt });
      return null;
    }
    if (leg.id === 'crowd') {
      b.stop();
      deps.turnBy?.(SWEEP_RAD_S * dt);
      return null;
    }
    // blade, bow, spell: face the nearest foe, close if he is far, and swing on the cadence.
    // THE PRESS IS ONE PRESS: the host's ladder runs magic.interceptAttack first and
    // weaponRig.attackInput otherwise, so the bow and the spell need no code of their own.
    const foe = deps.foeAt?.() ?? null;
    if (foe) {
      const dx = foe[0] - at[0];
      const dz = foe[2] - at[2];
      const delta = turnTo(Math.atan2(dx, dz), h);
      if (Math.abs(delta) > 0.1) deps.turnBy?.(Math.max(-0.12, Math.min(0.12, delta)));
      if (Math.hypot(dx, dz) > 4) b.steer({ at, heading: h, target: foe, dt });
      else b.steer({ at, heading: h, target: [at[0], at[1], at[2]], dt });
    }
    b.tick(clock());
    if (clock() >= swingAt) { b.startSwing(clock(), SWING_MS); swingAt = clock() + SWING_EVERY_MS; }
    return null;
  }

  const api = {
    /** Called once a frame by the host that wired it. `now` is the frame's rAF stamp - the same
     *  beat `fpsCounter` measures - so a leg's stamps and the counter's numbers share a clock. */
    tick(dt, now) {
      const at = Number.isFinite(now) ? now : clock();
      if (state !== 'running') return;
      if (index < 0) { begin(); if (state !== 'running') return; }
      const leg = legs[index];
      if (!leg) return;
      if (phase === 'settle') {
        // the stream's own test (this host's `__streamIdle`): the queue empty, nothing building,
        // nothing in flight. A host with no stream says so by answering true.
        const idle = deps.settle ? !!deps.settle() : true;
        if (idle || at - phaseAt >= SETTLE_CEILING_MS) { phase = 'warmup'; phaseAt = at; stamps = []; }
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
            failures.push(`${leg.title}: the map could not open a journey (nowhere discovered to travel to, or the map refused)`);
            return finish();
          }
        }
        if (!deps.settle?.()) sawBusy = true;
        const held = at - phaseAt;
        if (sawBusy && deps.settle?.() && held >= STREAM_MIN_MS) return endLeg();
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
      bot?.stop();
      if (state === 'running') {
        failures.push('the run was stopped before it finished');
        finish();
      }
    },
    dispose() {
      bot?.stop();
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
