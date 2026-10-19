import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installInputLock, LOCKED_EVENTS, LOCK_BYPASS_SELECTOR } from '../../../src/systems/bench/lock.js';

// BENCH1's lock: the player's hands come off the game while the run is live, and the benchmark's
// own synthetic presses go through untouched. The distinction the whole design rests on is
// `isTrusted` - a real event says true, a `dispatchEvent`ed one says false - so it is pinned here
// in both directions rather than trusted to a comment.

/** A stand-in for the document: records capture listeners, and hands back the event a page would
 *  have delivered. */
function rig() {
  const added = [];
  const removed = [];
  const host = {
    addEventListener: (type, fn, opts) => added.push({ type, fn, capture: opts?.capture === true }),
    removeEventListener: (type, fn, opts) => removed.push({ type, fn, capture: opts?.capture === true }),
    exitPointerLock: () => { host.lockGone = (host.lockGone ?? 0) + 1; },
  };
  return { host, added, removed };
}

/** The event a person's keyboard really sends: `isTrusted` true, no card under the target. */
function humanEvent(type = 'keydown', target = { closest: () => null }) {
  const e = { type, isTrusted: true, stopped: 0, prevented: 0, target,
    stopImmediatePropagation() { this.stopped++; }, preventDefault() { this.prevented++; } };
  return e;
}

test('BENCH1 lock: the person\'s key is refused before the host ever hears it, and the bench\'s own press is not', () => {
  const { host, added } = rig();
  const release = installInputLock({ target: host, document: host });
  assert.equal(added.length, LOCKED_EVENTS.length, 'every event a hand can act on is captured');
  assert.ok(added.every((l) => l.capture === true), 'CAPTURE: the document runs before the hosts\' window listeners');
  const keydown = added.find((l) => l.type === 'keydown');

  const theirs = humanEvent('keydown');
  keydown.fn(theirs);
  assert.equal(theirs.stopped, 1, 'stopImmediatePropagation, so the host\'s own listener never runs');
  assert.equal(theirs.prevented, 1, 'and the browser\'s own default is refused with it');

  // THE BENCHMARK'S OWN PRESS: a synthetic event, exactly what systems/bench/bot.js dispatches
  const ours = humanEvent('keydown');
  ours.isTrusted = false;
  keydown.fn(ours);
  assert.equal(ours.stopped, 0, 'the bot presses through the lock - it is not the person at the keyboard');
  assert.equal(ours.prevented, 0);

  release();
});

test('BENCH1 lock: the pointer lock is given back once - it is the one camera a listener cannot refuse', () => {
  const { host } = rig();
  installInputLock({ target: host, document: host })();
  assert.equal(host.lockGone, 1, 'released, so a locked pointer\'s movementX stops turning the view');
});

test('BENCH1 lock: the card keeps its own hands - a press inside it is the tool\'s, not the game\'s', () => {
  const { host, added } = rig();
  installInputLock({ target: host, document: host });
  const click = added.find((l) => l.type === 'click');
  const inCard = { closest: (sel) => (sel === LOCK_BYPASS_SELECTOR ? {} : null) };
  const cardPress = humanEvent('click', inCard);
  click.fn(cardPress);
  assert.equal(cardPress.stopped, 0, 'a reader can still close a run they no longer want to watch');
  const inGame = humanEvent('click');
  click.fn(inGame);
  assert.equal(inGame.stopped, 1, 'and a click on the game is still withheld');
});

test('BENCH1 lock: the release takes every listener away and is safe to call twice', () => {
  const { host, added, removed } = rig();
  const release = installInputLock({ target: host, document: host });
  release();
  assert.equal(removed.length, added.length, 'every capture listener came off');
  assert.deepEqual(removed.map((l) => l.type).sort(), [...LOCKED_EVENTS].sort());
  assert.ok(removed.every((l) => l.capture === true), 'removed with the same capture flag it was added with');
  release();
  assert.equal(removed.length, added.length, 'a second release is a no-op, not a second removal');
});

test('BENCH1 lock: a page with no document gets a no-op release rather than a crash', () => {
  const release = installInputLock({ target: null, document: null });
  assert.equal(typeof release, 'function');
  release();
});
