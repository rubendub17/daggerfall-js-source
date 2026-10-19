import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DASH, legRow, legHead, reportLines, createBenchOverlay } from '../../../src/ui/benchOverlay.js';

// BENCH1's card. The pure half (the row and the report's text) EXECUTES here; the DOM half runs
// against the stub document AUDIT 62's FPS test built (test/ui/enhanced/mwarms_fps.test.js), for
// the same reason: a card that builds a node a frame is a cost inside the measurement.

const WIDTHS = { leg: 22, low: 8, fps: 5, p95: 7, p99: 7, script: 8, gpu: 7, draws: 6 };

/** The report shape a host hands in - one leg measured, one not. */
const REPORT = {
  at: '2026-10-19T12:00:00.000Z',
  gpu: 'ANGLE (NVIDIA GeForce RTX 4060 Ti, D3D11)',
  size: 'world 1280x720  canvas 1280x720  dpr 1  scale 100%',
  build: 'Update 42',
  preset: 'renderScale 1, shadows, grass, crowd, trees, reflections',
  legs: [
    { id: 'street', title: 'The street run', lowFps: 58, fps: 63, p95Ms: 16.5, p99Ms: 17.2, scriptMs: 6.4, gpuMs: 9.9, draws: 220 },
    { id: 'crowd', title: 'The crowd', lowFps: null, fps: null, p95Ms: null, p99Ms: null, scriptMs: null, gpuMs: null, draws: null },
  ],
  score: 58, grade: 'B', missing: ['crowd'], failures: [],
};

const stubEl = () => ({
  id: '', textContent: '', onclick: null,
  style: { cssText: '', display: '' },
  children: [],
  appendChild(c) { this.children.push(c); return c; },
  remove() { this.removed = true; },
});

/** Run `fn` with a stub document, and hand back everything it created so a button can be pressed. */
function withStubDocument(fn) {
  const prev = globalThis.document;
  const made = [];
  globalThis.document = { createElement: () => { const n = stubEl(); made.push(n); return n; }, body: stubEl() };
  try { return fn(made); } finally { globalThis.document = prev; }
}

test('BENCH1 card: a leg\'s row is the columns a reader compares machines by', () => {
  const want = ['The street run'.padEnd(WIDTHS.leg), '58'.padStart(WIDTHS.low), '63'.padStart(WIDTHS.fps),
    '16.5'.padStart(WIDTHS.p95), '17.2'.padStart(WIDTHS.p99), '6.4'.padStart(WIDTHS.script),
    '9.9'.padStart(WIDTHS.gpu), '220'].join('  ');
  assert.equal(legRow(REPORT.legs[0]), want);
  assert.equal(legRow(REPORT.legs[0]), legRow(REPORT.legs[0]).trimEnd(), 'the last column is never padded: a trailing space is noise in a copied file');
});

test('BENCH1 card: an unmeasured leg prints a dash in every column, never a zero', () => {
  const row = legRow(REPORT.legs[1]);
  assert.ok(row.startsWith('The crowd'), row);
  const numeric = row.slice('The crowd'.length);
  assert.match(numeric, /^[\s\u2014]+$/, `nothing but dashes and padding after the title: ${JSON.stringify(numeric)}`);
  assert.equal(/\d/.test(numeric), false, 'no digit anywhere in a row with nothing measured - a zero would read as a free leg');
  assert.equal((numeric.match(/\u2014/g) ?? []).length, 7, 'all seven numeric columns are dashes');
});

test('BENCH1 card: the head names the same columns as the rows', () => {
  const want = ['leg'.padEnd(WIDTHS.leg), '1% low'.padStart(WIDTHS.low), 'fps'.padStart(WIDTHS.fps),
    'p95'.padStart(WIDTHS.p95), 'p99'.padStart(WIDTHS.p99), 'script'.padStart(WIDTHS.script),
    'gpu'.padStart(WIDTHS.gpu), 'draws'].join('  ');
  assert.equal(legHead(), want);
});

test('BENCH1 card: the report says what was measured, on what machine, at what preset - and what was not', () => {
  const lines = reportLines(REPORT);
  const text = lines.join('\n');
  assert.match(lines[0], /^Benchmark - 2026-10-19T12:00:00\.000Z$/);
  assert.match(text, /RTX 4060 Ti/, 'the GPU the numbers are of');
  assert.match(text, /Update 42/, 'the build they are of');
  assert.match(text, /preset: renderScale 1/, 'the settings the run forced and recorded');
  assert.match(text, /SCORE 58 \(B\)/);
  assert.ok(text.includes(legHead()), 'the head and the rows are in one text');
  assert.ok(text.includes('The crowd'), 'the unmeasured leg is still listed - silence would hide it');
  assert.match(text, /not measured: crowd/);
  assert.equal(text.includes('FAILED:'), false, 'a clean run says nothing about failure');
});

test('BENCH1 card: a run with no score says so instead of printing a zero', () => {
  const bad = reportLines({ ...REPORT, score: null, grade: null, legs: [], missing: ['street'] });
  const text = bad.join('\n');
  assert.match(text, new RegExp(`SCORE ${DASH} - nothing was measured`), text);
  assert.equal(/SCORE 0\b/.test(text), false, 'a 0 score would read as a measured one');
});

test('BENCH1 card: the failures come last, because they are the first thing a reader needs', () => {
  const text = reportLines({ ...REPORT, score: null, grade: null, failures: ['7 people in the street, the leg promises 8', 'the player died in the fight'] });
  const lines = text;
  const i = lines.indexOf('FAILED:');
  assert.ok(i > 0, 'the failures block stands');
  assert.deepEqual(lines.slice(i + 1), ['  7 people in the street, the leg promises 8', '  the player died in the fight']);
  assert.equal(lines.at(-1), '  the player died in the fight', 'nothing is printed after the last failure');
});

test('BENCH1 card: the card is prepared, driven and disposed, and a Download is the same text the report gives', () => {
  withStubDocument((made) => {
    let exported = null;
    let closed = 0;
    const card = createBenchOverlay({ onExport: (t) => { exported = t; }, onClose: () => { closed++; } });
    assert.equal(card.el.style.display, 'none', 'hidden until a run is asked for');

    card.prepare([{ id: 'street', title: 'The street run' }, { id: 'crowd', title: 'The crowd' }]);
    assert.equal(card.el.style.display, 'flex', 'shown when the run begins');
    const cardEl = card.el.children[0];
    const body = cardEl.children[2];
    assert.match(body.textContent, /The street run/);
    assert.match(body.textContent, /The crowd/);

    card.progress('street', 0.5);
    assert.match(body.textContent, /\[#{12}\.{12}\]/, `a half leg is half a bar: ${body.textContent}`);
    card.done('street');
    card.finish(REPORT);
    assert.equal(body.textContent, reportLines(REPORT).join('\n'), 'what is drawn is what is copied');
    const buttons = cardEl.children[3];
    assert.equal(buttons.style.display, 'flex', 'the export buttons stand only once there is something to export');

    buttons.children[1].onclick();   // Download
    assert.equal(exported, reportLines(REPORT).join('\n'), 'the file is the card\'s own text - one definition, never a second writer');
    buttons.children[2].onclick();   // Close
    assert.equal(closed, 1);
    assert.equal(card.el.removed, true, 'the card is gone from the document, not merely hidden');
    assert.ok(made.length > 0);
  });
});
