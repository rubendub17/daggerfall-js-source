import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// BENCH1's own laws, swept over its own source. A benchmark is a probe that runs the real game
// unattended, so the ways it could cheat are exactly the ways it would stop measuring:
//   - it could heal the character instead of measuring a fight a living character could lose;
//   - it could wander into the online lane and measure a relay's frame instead of the game's;
//   - it could send its numbers somewhere (the benchmark is offline, and the project keeps a
//     privacy page: a result that phoned home would be a hole, not a feature);
//   - it could reach god mode behind the engine's back, so the damage path the fight leg is
//     supposed to exercise would be a fiction;
//   - it could mint its own bow and arrows, and then two item tables drift apart the way
//     Home.md's ONE DFU MEMBER, ONE EXPORT rule exists to prevent;
//   - it could spell a key. The bot presses what the player's bindings resolve to, never its
//     own idea of which key walks forward - a player who rebound Walk Forward must still be
//     benchable, and a hard-coded 'KeyW' is the bug that makes the benchmark measure nobody.
//
// This file is the guard, so the next author does not have to remember any of it.

const BENCH_DIR = 'src/systems/bench';
const HOST = 'src/scenes/benchHost.js';
const CARD = 'src/ui/benchOverlay.js';

/** The bench's own sources: the law layer, the card, and (once it exists) the one module the
 *  host wires. All three are the benchmark: a rule broken in the card is broken in the tool. */
function benchSources() {
  const out = [];
  if (existsSync(BENCH_DIR)) {
    for (const f of readdirSync(BENCH_DIR)) {
      if (f.endsWith('.js')) out.push(join(BENCH_DIR, f));
    }
  }
  for (const f of [HOST, CARD]) if (existsSync(f)) out.push(f);
  return out;
}

/** The code, without its comments: a header is allowed to NAME the thing a rule forbids
 *  (that is how the rules above are explained) and must not be read as doing it. */
const code = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

const sources = benchSources().map((f) => ({ f, code: code(readFileSync(f, 'utf8')) }));

test('BENCH1 hygiene: the bench has sources to sweep at all', () => {
  assert.ok(sources.length >= 4, `expected the bench's law layer, found ${sources.length} file(s): ${sources.map((s) => s.f).join(', ')}`);
});

test('BENCH1 hygiene: the body is a HEALTH POOL, written once, in the host, and recorded', () => {
  // BENCH1, Mac's call (2026-10-19): "A huge health pool instead". The pool keeps the whole
  // damage path - the shield, the modifiers, the evasion roll, the blood - inside the
  // measurement, where the engine's own /god would have taken all four out of it. The trade is
  // that the bench now DOES write a vital, so the write is held to exactly one home, one place
  // in it, and one value: the law's pool.
  const writes = [];
  for (const { f, code: c } of sources) {
    for (const m of c.matchAll(/\b(?:playerEntity|entity|player|body)\.(health|maxHealth)\s*=\s*([^;\n]+)/g)) writes.push({ f, field: m[1], value: m[2].trim() });
  }
  assert.equal(writes.length, 2, `the pool is TWO assignments (health and maxHealth), found ${writes.length}: ${JSON.stringify(writes)}`);
  for (const w of writes) {
    assert.equal(w.f, HOST.replace(/\\/g, '/'), `a vital written outside the host module: ${w.f}`);
    assert.match(w.value, /^BENCH_VITAL\./, `a vital written from something other than the law's pool: ${w.f}: ${w.value}`);
  }
  assert.deepEqual(writes.map((w) => w.field).sort(), ['health', 'maxHealth'], 'the pair, not one of them - half a pool is a body that dies at its own maximum');
  // and nothing else of the body is touched: a magicka or fatigue refill would be a second lie
  const others = sources.filter(({ code: c }) => /\b(playerEntity|entity)\.(magicka|fatigue|currentMagicka|currentFatigue)\s*=[^=]/.test(c)).map((s) => s.f);
  assert.deepEqual(others, [], 'the bench writes a vital that is not the pool');
});

test('BENCH1 hygiene: /god is NOT used - the pool is the chosen body and god mode would unmeasure the fight', () => {
  const users = sources.filter((s) => /\bsetStaffPowers\b/.test(s.code)).map((s) => s.f);
  assert.deepEqual(users, [], 'god mode withholds the blow before the shield, the modifiers and the evasion roll - the fight legs would stop measuring those');
});

test('BENCH1 hygiene: the bench never enters the online lane', () => {
  const offenders = [];
  for (const { f, code: c } of sources) {
    if (/from\s+['"][^'"]*(net\/|systems\/online\/|onlineLane)/.test(c)) offenders.push(`${f}: imports the online lane`);
    if (/\bonlineOn\b|\bjoinRelay\b|\?online\b|&online\b/.test(c)) offenders.push(`${f}: reaches for the relay`);
  }
  assert.deepEqual(offenders, [], 'the benchmark is offline: a relay\'s frame is not the game\'s, and a run must not need a signed-in browser');
});

test('BENCH1 hygiene: a result never leaves the machine', () => {
  const offenders = [];
  for (const { f, code: c } of sources) {
    if (/\bfetch\s*\(|XMLHttpRequest|sendBeacon|\bWebSocket\b/.test(c)) offenders.push(`${f}: opens the network`);
  }
  assert.deepEqual(offenders, [], 'the benchmark writes a local file and nothing else - no upload path may exist in the code at all');
});

test('BENCH1 hygiene: the combat kit is the Test Room\'s, so two bows cannot drift apart', () => {
  const offenders = [];
  for (const { f, code: c } of sources) {
    // minting an item or a spell is testRoom.js's job; the bench EQUIPS, it never MINTS
    for (const m of c.matchAll(/\b(createWeapon|mintCondition|templateByIndex|mintGem|createFishItem|socketMax)\s*\(/g)) offenders.push(`${f}: ${m[1]}()`);
  }
  assert.deepEqual(offenders, [], 'the bench mints its own gear instead of reading systems/testRoom.js (testGearRows / addTestMissileSpells) - that is how two item tables come to disagree');
});

test('BENCH1 hygiene: the bot presses the player\'s bindings, and never spells a key', () => {
  const offenders = [];
  for (const { f, code: c } of sources) {
    for (const m of c.matchAll(/['"](Key[A-Z]|Mouse[0-9]|Digit[0-9]|Arrow[A-Z][a-z]+|Space|Enter|Escape)['"]/g)) {
      // the exception is a DEFAULT the registry itself owns, and there is none here: the bench
      // receives its codes from systems/inputActions.js codeForAction at run time
      offenders.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(offenders, [], 'a key code is written into the bench - a player who rebound Walk Forward could not be benchmarked, and the bot would press a key the game no longer reads');
});
