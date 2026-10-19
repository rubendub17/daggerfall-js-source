// BENCH1 - THE PLAYER'S HANDS ARE TAKEN OFF THE GAME (2026-10-19, Mac's ask: "all the user input
// will be disabled until the benchmark end"). A benchmark that plays itself while a human can
// still press W is not a measurement: one stray key walks the character off the track, one click
// swings the weapon off its cadence, and the leg reports a scene that never happened. So while a
// run is live the game takes no input from the person at the keyboard - and the benchmark's OWN
// presses still reach it, because those are not the person's.
//
// HOW, IN ONE PLACE, WITH NO HOST TOUCHED. Every host listens for its keys on `window` (its own
// `addEventListener('keydown', ...)`), and every one of those is a BUBBLE listener. A listener
// registered on `document` in the CAPTURE phase runs before them on the event's way down, and
// `stopImmediatePropagation()` there means the hosts never hear the event at all - no key added
// to their held sets, no click, no wheel, no look. The benchmark's own input is a synthetic
// `KeyboardEvent` (systems/bench/bot.js), and a synthetic event has `isTrusted === false`: the
// lock refuses only what a HUMAN hands the page, so the bot's presses are untouched by
// construction rather than by an allow-list that could drift.
//
// THE POINTER LOCK GOES TOO. Mouse-look on this port needs the canvas's pointer lock, and a
// locked pointer is the one camera the lock above cannot stop (a locked pointer's `movementX`
// arrives without an event the page can refuse). Releasing it once at the start, with every
// click that would take it back refused, is what keeps the run's look in the bot's hands.
//
// THE CARD KEEPS ITS OWN HANDS. A press on the benchmark's own card (its Close, its Copy) is the
// TOOL's, not the game's: an event whose target sits inside `#dfbench` is let through, so a reader
// can end a run they no longer want to watch.

/** Every event a person can act on, at the moment it is about to reach the game. `mousemove` is in
 *  the list even though mouse-look is gated on the pointer lock, because a host that reads the
 *  delta anyway (the free-cursor skins do) would turn the camera out from under the bot. */
export const LOCKED_EVENTS = Object.freeze([
  'keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'mousemove', 'wheel', 'click', 'dblclick',
  'pointerdown', 'pointerup', 'pointermove', 'contextmenu', 'touchstart', 'touchend', 'touchmove',
]);

/** The card's own root: a press inside it is the tool's, and is never withheld. */
export const LOCK_BYPASS_SELECTOR = '#dfbench';

/**
 * Take the player's hands off the game until the returned function is called.
 * @param {{ target?: any, document?: any }} [opts] `target` is where the capture listeners go
 *   (the document, the ancestor of the hosts' window listeners); it defaults to the page's.
 * @returns {() => void} the release: removes every listener, and is safe to call twice.
 */
export function installInputLock({ target = null, document: doc = globalThis.document } = {}) {
  const host = target ?? doc;
  if (!host || typeof host.addEventListener !== 'function') return () => {};
  const taken = [];
  const refuse = (e) => {
    // THE TOOL'S OWN CARD IS NOT THE GAME. Its Close and its Copy are how a person stops or keeps
    // a run; refusing those would leave a live benchmark with no way out but a refresh.
    if (e?.target?.closest?.(LOCK_BYPASS_SELECTOR)) return;
    // a SYNTHETIC event is the benchmark's own hand (bot.js); only a human's is withheld
    if (e?.isTrusted !== true) return;
    e.stopImmediatePropagation?.();
    e.preventDefault?.();
    taken.push(e.type);
  };
  for (const type of LOCKED_EVENTS) {
    host.addEventListener(type, refuse, { capture: true, passive: false });
  }
  // the one camera the listener cannot refuse (see the header): let the pointer go, once
  try { doc?.exitPointerLock?.(); } catch { /* no lock, or a browser without the API: nothing to give back */ }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const type of LOCKED_EVENTS) host.removeEventListener(type, refuse, { capture: true });
  };
}
