// BENCH1 - THE BENCHMARK'S HANDS (2026-10-19). A benchmark has to play the
// game with the game's own hands: no host may learn a second vocabulary, and
// no leg may reach past the input the player has. So the bot presses KEYS -
// the codes the player's own bindings resolve to - and the press travels the
// same route a keyboard's does: the host's held set, the action registry, the
// motor. `src/ui/gamepadInput.js` is the precedent ("a button's edge is a
// synthetic KeyboardEvent whose code is the Unity name"), and the same law
// holds here: press a bound code, and every host answers as it would for a
// hand on the keyboard.
//
// THE BINDINGS ARE READ, NEVER ASSUMED. A player may have moved Walk Forward
// to anything, so the caller hands in the codes the registry resolves today
// (`systems/inputActions.js` `codeForAction`) - this module never spells a key.
//
// ONE SWING FOR THREE WEAPONS, ON PURPOSE. A blade, a drawn bow and a readied
// spell are all the same press in this game: the host's ladder runs
// `magic.interceptAttack(true)` first ("an armed cast eats the click") and
// otherwise `weaponRig.attackInput(dx, dy, held)`. So the fight legs differ in
// what the character is HOLDING and never in what the bot does - which is the
// point: the benchmark measures the three systems as the game wires them, and
// if the ladder ever changed, the bow leg would fight with a sword and the
// numbers would say so.
//
// A HELD KEY WITH NO HAND ON IT IS THE DISEASE. Everything this bot presses it
// releases - on a swing's deadline, on `stop()`, and on teardown - the guard
// `ui/touch/touch.js` `up()` keeps for the thumb.

import { steerTo } from './track.js';

/**
 * The bot. It owns no clock and no timer: the host calls `tick(now)` once a frame, and a swing ends when
 * the deadline it was given has passed.
 * @param {{
 *   codes: { forward:string, back?:string, left?:string, right?:string, run?:string, swing:string },
 *   press: (code:string) => void, release: (code:string) => void,
 *   look?: ((deltaRad:number) => void) | null,
 * }} deps `codes` are the player's own bound codes; `press`/`release` are the host's synthetic key edges;
 *   `look` turns the view by radians, if the host has such a hook.
 */
export function createBenchBot({ codes, press, release, look = null }) {
  if (!codes || typeof codes.swing !== 'string' || typeof codes.forward !== 'string') {
    throw new Error('bench bot: codes.swing and codes.forward are required - the bot presses the player\'s bindings, never its own');
  }
  if (typeof press !== 'function' || typeof release !== 'function') throw new Error('bench bot: press and release are the host\'s key edges');
  const held = new Set();
  const hold = (code) => { if (code && !held.has(code)) { held.add(code); press(code); } };
  const letGo = (code) => { if (code && held.delete(code)) release(code); };
  let swingUntil = null;   // ms, the deadline the caller set; null when nothing is held
  let swings = 0;

  return {
    /** Walk at `target` from where the character stands. Holds the walk keys the game's own bindings name,
     *  turns the look by as much as one tick allows, and lets go of what it no longer wants. */
    steer({ at, heading, target, dt = 1 / 60 } = {}) {
      const s = steerTo({ at, heading, target, dt });
      if (s.forward) hold(codes.forward); else letGo(codes.forward);
      if (codes.run) { if (s.forward) hold(codes.run); else letGo(codes.run); }
      if (look && s.lookDelta) look(s.lookDelta);
      return s;
    },
    /** Hold the swing key from `now` for `ms`. The same press for a blade, a bow or a readied spell. */
    startSwing(now, ms = 250) {
      hold(codes.swing);
      swingUntil = (Number(now) || 0) + Math.max(1, Number(ms) || 1);
      swings++;
      return swingUntil;
    },
    /** Called once a frame: ends a swing whose deadline has passed, and does nothing else. */
    tick(now) {
      if (swingUntil !== null && (Number(now) || 0) >= swingUntil) {
        letGo(codes.swing);
        swingUntil = null;
      }
      return swingUntil === null;
    },
    /** Everything up - the run's end, a leg's end, and the teardown. */
    stop() {
      for (const code of [...held]) letGo(code);
      swingUntil = null;
    },
    /** The codes currently held, sorted - what a leg's report can say the bot was doing. */
    held: () => [...held].sort(),
    /** Swings begun this run - a fight leg that swung no times measured a corridor. */
    swings: () => swings,
    /** Whether a swing is in flight. */
    swinging: () => swingUntil !== null,
  };
}
