// BENCH1 - THE CARD, AS A HUMAN SEES IT (2026-10-19). The benchmark's card is DOM with no game in
// it (`ui/benchOverlay.js` imports nothing), so it can be stood over the front door and
// photographed without ARENA2, without a player and without a run. That is the point: the card is
// what a person reads, and it is worth eyeballing before anything spends twenty seconds a leg
// finding out the table is unreadable.
//
// THE NUMBERS HERE ARE A FIXTURE, and they say so on the card: this probe proves the CARD, never a
// measurement. A picture of a benchmark that never ran is exactly the lie `test/tooling/
// probehygiene.test.js` T3 exists for, so the fixture's own failure line is printed in one of the
// photographs - a card that cannot show a failure is a card that cannot be believed.
//
//     node tools/benchCardProbe.mjs          (SHOT_DIR= where the PNGs land)
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const OUT = process.env.SHOT_DIR ?? 'tools/shots';
mkdirSync(OUT, { recursive: true });

/** A Chrome is a Chrome, but this checkout's playwright asks for one build number and a machine
 *  often holds another (tools/cpuReport.mjs's own fallback, and its reason - `npm run perf` fails
 *  the same way without it). The bundled browser is tried first, then the cache's newest full
 *  chromium, then CHROME= says which. */
function cachedChromium() {
  const platformBase = process.platform === 'win32' ? join(homedir(), 'AppData', 'Local', 'ms-playwright')
    : process.platform === 'darwin' ? join(homedir(), 'Library', 'Caches', 'ms-playwright')
      : join(homedir(), '.cache', 'ms-playwright');
  // the env path is a HINT: on a machine that sets none, the `??=` above points it at the Linux
  // default, which exists nowhere else - so a path that is not there falls back to the platform's
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(process.env.PLAYWRIGHT_BROWSERS_PATH)
    ? process.env.PLAYWRIGHT_BROWSERS_PATH : platformBase;
  const bins = ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux64/chrome', 'chrome-linux/chrome',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium'];
  let dirs = [];
  try { dirs = readdirSync(base).filter((n) => /^chromium-\d+$/.test(n)).sort((a, b) => parseInt(b.slice(9)) - parseInt(a.slice(9))); } catch { dirs = []; }
  for (const d of dirs) for (const b of bins) { const p = join(base, d, b); if (existsSync(p)) return p; }
  return null;
}

async function launchBrowser(opts) {
  if (process.env.CHROME) return chromium.launch({ ...opts, executablePath: process.env.CHROME });
  try { return await chromium.launch(opts); } catch (err) {
    if (!/Executable doesn't exist/.test(err?.message ?? '')) throw err;
    const exe = cachedChromium();
    if (!exe) throw new Error('bench card: no browser - run `npx playwright install chromium`, or set CHROME=<path to chrome.exe>');
    return chromium.launch({ ...opts, executablePath: exe });
  }
}

const server = await createServer({ server: { port: 5239, strictPort: true }, logLevel: 'silent' });
await server.listen();
const browser = await launchBrowser({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) { fails++; console.log(`FAIL ${name}${detail ? ` - ${detail}` : ''}`); } };

// The front door needs no game data (main.js boots the menu before ARENA2 is asked for), and
// ?nointro skips the film, which mounts on its own clock.
await page.goto('http://localhost:5239/play/?nointro&touch=off');
await page.evaluate(async () => {
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:radial-gradient(circle at 30% 20%,#2b3440,#10141a 70%);height:100vh;font:13px/1.45 system-ui,sans-serif';
});

const LEGS = {
  street: { id: 'street', title: 'The street run', kind: 'frame', scene: 'world', seconds: 20, frames: 1187, fps: 59, meanMs: 16.8, minMs: 12.1, p50Ms: 16.7, p95Ms: 18.1, p99Ms: 24.6, worstMs: 41.2, lowFps: 40.7, scriptMs: 6.4, gpuMs: 9.9, draws: 220, binds: 118, census: { people: 41 }, notes: [] },
  crowd: { id: 'crowd', title: 'The crowd', kind: 'frame', scene: 'world', seconds: 20, frames: 1201, fps: 60, meanMs: 16.6, minMs: 15.9, p50Ms: 16.6, p95Ms: 17.0, p99Ms: 17.1, worstMs: 19.0, lowFps: 58.5, scriptMs: 4.1, gpuMs: 8.2, draws: 241, binds: 122, census: { people: 44 }, notes: [] },
  blade: { id: 'blade', title: 'A fight: the blade', kind: 'frame', scene: 'dungeon', seconds: 20, frames: 1104, fps: 55, meanMs: 18.1, minMs: 13.0, p50Ms: 17.7, p95Ms: 22.3, p99Ms: 34.9, worstMs: 52.7, lowFps: 28.7, scriptMs: 8.9, gpuMs: 11.4, draws: 187, binds: 96, census: { foes: 5 }, notes: ['the counter read 55 fps'] },
  bow: { id: 'bow', title: 'A fight: the bow', kind: 'frame', scene: 'dungeon', seconds: 20, frames: 1098, fps: 55, meanMs: 18.2, minMs: 13.4, p50Ms: 17.9, p95Ms: 22.6, p99Ms: 36.2, worstMs: 61.0, lowFps: 27.6, scriptMs: 9.2, gpuMs: 11.8, draws: 191, binds: 98, census: { foes: 5 }, notes: [] },
  spell: { id: 'spell', title: 'A fight: a spell', kind: 'frame', scene: 'dungeon', seconds: 20, frames: 1041, fps: 52, meanMs: 19.2, minMs: 13.9, p50Ms: 18.6, p95Ms: 24.9, p99Ms: 41.8, worstMs: 78.4, lowFps: 23.9, scriptMs: 10.6, gpuMs: 12.6, draws: 205, binds: 104, census: { foes: 5 }, notes: [] },
};

const REPORT = {
  at: '2026-10-19T12:04:00.000Z', scene: 'all',
  gpu: 'ANGLE (NVIDIA GeForce RTX 4060 Ti, D3D11)', size: 'world 1920x1080  canvas 1920x1080  dpr 1  scale 100%',
  build: 'Update 42', preset: 'renderScale 1, shadows true, grass true, crowd true, trees true, reflections true',
  vital: 'health pool 1000000 of 1000000',
  input: 'the player\'s hands are locked out', tutorials: 'off',
  legs: [LEGS.street, LEGS.crowd, LEGS.blade, LEGS.bow, LEGS.spell, { id: 'dungeon', title: 'The dungeon', kind: 'frame', scene: 'dungeon', seconds: null, frames: 0, fps: null, meanMs: null, minMs: null, p50Ms: null, p95Ms: null, p99Ms: null, worstMs: null, lowFps: null, scriptMs: null, gpuMs: null, draws: null, binds: null, census: { foes: 0 }, notes: [] }],
  score: 33.6, grade: 'C', missing: ['dungeon', 'stream'],
  failures: ['The dungeon: 0 foes, the leg promises 3', 'The stream: the stream never settled in 60 s'],
};

/** Draw the card in one of three states, photograph it, and hand back what the DOM says. */
async function shoot(name, state) {
  const read = await page.evaluate(async ({ report, state }) => {
    const { createBenchOverlay, reportLines } = await import('/src/ui/benchOverlay.js');
    for (const old of [...document.querySelectorAll('#dfbench')]) old.remove();
    const card = createBenchOverlay({ onExport: () => {}, onClose: () => {} });
    if (state === 'running') {
      card.prepare(report.legs.map((l) => ({ id: l.id, title: l.title })));
      card.progress('blade', 0.42);
    } else {
      card.prepare(report.legs.map((l) => ({ id: l.id, title: l.title })));
      for (const l of report.legs) card.done(l.id);
      card.finish(report);
    }
    const el = document.getElementById('dfbench');
    const body = el.querySelector('pre');
    const buttons = el.children[0].children[3];
    return {
      shown: getComputedStyle(el).display !== 'none',
      text: body.textContent,
      buttons: buttons.style.display,
      inside: (() => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.bottom <= innerHeight; })(),
      want: reportLines(report).join('\n'),
    };
  }, { report: REPORT, state });
  await page.screenshot({ path: `${OUT}/bench-card-${name}.png` });
  return read;
}

const running = await shoot('running', 'running');
const done = await shoot('done', 'report');

check('BENCH1 card: it stands, and it is on screen', running.shown && running.inside, JSON.stringify({ shown: running.shown, inside: running.inside }));
check('BENCH1 card: a leg in flight draws its bar, not its numbers', /\[#{10}\.{14}\]/.test(running.text), running.text.split('\n').find((l) => l.includes('[')) ?? '');
check('BENCH1 card: the finished card is the report\'s own text', done.text === done.want, 'the card and reportLines disagree');
check('BENCH1 card: the table names every leg that was measured, and the two that were not', REPORT.legs.every((l) => done.text.includes(l.title)), 'a leg is missing from the table');
check('BENCH1 card: the score and its grade stand above the failures', /SCORE 34 \(C\)/.test(done.text) && done.text.indexOf('SCORE') < done.text.indexOf('FAILED:'), 'the verdict and the failures are out of order');
check('BENCH1 card: an unmeasured number is a dash, never a zero', done.text.includes('\u2014') && !/SCORE 0\b/.test(done.text), 'a dash is missing');
check('BENCH1 card: the export buttons stand only once there is something to export', running.buttons === 'none' && done.buttons === 'flex', `${running.buttons} -> ${done.buttons}`);
check('BENCH1 card: no page error while the card is drawn', errors.length === 0, errors.slice(0, 2).join(' | '));

/** What a first visit to the benchmark door shows on a machine with no data folder: the GAME'S OWN
 *  gate, the same one every other door meets (main.js awaits ensureArena2() before bootWorld, so a
 *  `?bench=` URL asks for the folder exactly as Play does) - never a blank page, and never the
 *  bench's word for it. The pick is stored once (IndexedDB) and every later run skips it. */
await page.goto('http://localhost:5239/play/?world&bench=crowd&class=16&shot&play&fps');
await page.waitForTimeout(4000);
const gate = await page.evaluate(() => ({
  bench: typeof globalThis.window?.__bench,
  text: (document.body?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 4000),
  hasPicker: !!document.querySelector('input[type=file]'),
}));
await page.screenshot({ path: `${OUT}/bench-first-visit.png` });
// with ARENA2_PATH set the server HAS the data and the door boots instead of asking - which is the
// right behaviour and not a gate failure, so this is asserted only on a machine without it.
if (!process.env.ARENA2_PATH) check('BENCH1 door: a machine with no game data meets the GAME\'S OWN ARENA2 gate, and no bench is started blind',
  gate.bench === 'undefined' && /ARENA2/.test(gate.text), `__bench is ${gate.bench}; the page says "${gate.text}"`);
if (!process.env.ARENA2_PATH) check('BENCH1 door: the gate offers the folder picker every other door has', gate.hasPicker, 'no directory input - a player could not get past it');

await browser.close();
await server.close();
if (fails) throw new Error(`bench card: ${fails} check(s) failed`);
console.log(`bench card: ${OUT}/bench-card-running.png, bench-card-done.png, bench-first-visit.png - the first visit says: "${gate.text}"`);
