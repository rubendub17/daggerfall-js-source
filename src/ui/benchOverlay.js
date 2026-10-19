// BENCH1 - THE BENCHMARK'S CARD (2026-10-19). The run has to be readable by the person who
// started it and by nobody else: a card over the game, live while the legs run, and a table
// at the end that says what was measured and what was not. It is drawn in its own inline
// style, as the FPS counter is (ui/fpsCounter.js), so it stands over the enhanced sheet, the
// classic one and a phone's alike and leans on none of them - and so the card can never be
// the reason a leg's frame time moved.
//
// A LEG THAT MEASURED NOTHING PRINTS A DASH, NEVER A ZERO. The same law as
// systems/bench/recorder.js, held here because the card is what a person actually reads: a
// `0 fps / 0 ms` row would be a claim that the leg was free, and the run's whole verdict
// (score, grade) is read off these rows. `—` says "not measured" and the failures line says
// why.
//
// The card holds no numbers of its own: the host hands in each leg's summary as it ends, and
// `reportLines` turns a finished report into the exact text a player copies or downloads. That
// pure half is executed by test/systems/bench/overlay.test.js; the DOM half runs against a stub
// document, as the FPS counter's does.

/** What an unmeasured number prints as. A zero would be a measurement, and it is not one. */
export const DASH = '\u2014';

const num = (v, digits = 1) => (Number.isFinite(v) ? Number(v).toFixed(digits) : DASH);
const int = (v) => (Number.isFinite(v) ? String(Math.round(v)) : DASH);

/** The column widths of the report's table - one place, so the header and the rows cannot part. */
const COLS = Object.freeze([
  ['leg', 22, 'left'], ['1% low', 8, 'right'], ['fps', 5, 'right'], ['p95', 7, 'right'],
  ['p99', 7, 'right'], ['script', 8, 'right'], ['gpu', 7, 'right'], ['draws', 6, 'right'],
]);

/** One cell, padded to its column. The last column is not padded (a trailing space is noise in a copied file). */
function cell(text, [name, width, side], last) {
  const s = String(text);
  if (last) return s;
  return side === 'left' ? s.padEnd(width) : s.padStart(width);
}

/**
 * One leg's row: the numbers a reader compares machines by. `1% low` is the frame rate of the
 * leg's slowest frames (recorder.js), `script` is the game's own JavaScript a frame, `gpu` is the
 * page's own clock (`?perf`) - and a dash in `gpu` is a browser that refused the timer, which is
 * not a zero.
 * @param {{id:string,title?:string,lowFps?:number,fps?:number,p95Ms?:number,p99Ms?:number,scriptMs?:number,gpuMs?:number,draws?:number}} leg
 * @returns {string} the row, one line
 */
export function legRow(leg = {}) {
  const cells = [
    String(leg.title ?? leg.id ?? '?').slice(0, COLS[0][1]),
    num(leg.lowFps, 0),
    int(leg.fps),
    num(leg.p95Ms),
    num(leg.p99Ms),
    num(leg.scriptMs),
    num(leg.gpuMs),
    int(leg.draws),
  ];
  return cells.map((v, i) => cell(v, COLS[i], i === cells.length - 1)).join('  ').trimEnd();
}

/** The table's heading, in the same columns as `legRow`. */
export function legHead() {
  return COLS.map((c, i) => cell(c[0], c, i === COLS.length - 1)).join('  ').trimEnd();
}

/**
 * A finished report as the text a player copies: what was measured, on what machine, and what
 * was not - the header, the table, the verdict, then every reason a leg did not count. The
 * failures are the LAST thing in the file, because they are the first thing a reader needs.
 * @param {object} report the host's report ({ at, gpu, size, preset, legs, score, grade, missing, failures })
 * @returns {string[]} the lines, ready to join with a newline
 */
export function reportLines(report = {}) {
  const legs = Array.isArray(report.legs) ? report.legs : [];
  const out = [];
  out.push(`Benchmark - ${report.at ?? 'a run'}`);
  const scene = [report.gpu ?? 'unknown GPU', report.size ?? null, report.build ?? null].filter(Boolean).join('  |  ');
  if (scene) out.push(scene);
  out.push(report.preset ? `preset: ${report.preset}` : 'preset: the player\'s own settings');
  // WHAT THE RUN DID TO THE MACHINE AND THE PLAYER, while it had it: a benchmark that took a
  // person's hands and switched their tutorials off must say so, because both are given back at
  // the end and a reader has to know they were taken.
  if (report.input || report.tutorials) {
    const terms = [report.input, report.tutorials ? `tutorials ${report.tutorials}` : null].filter(Boolean).join('  |  ');
    out.push(`run: ${terms}`);
  }
  out.push('');
  out.push(legHead());
  for (const leg of legs) out.push(legRow(leg));
  out.push('');
  if (Number.isFinite(report.score)) {
    out.push(`SCORE ${Math.round(report.score)}${report.grade ? ` (${report.grade})` : ''} - the harmonic mean of the legs' 1% lows, the rate of the worst frames a player feels`);
  } else {
    out.push(`SCORE ${DASH} - nothing was measured, so there is nothing to score`);
  }
  if (Array.isArray(report.missing) && report.missing.length) out.push(`not measured: ${report.missing.join(', ')}`);
  if (Array.isArray(report.failures) && report.failures.length) {
    out.push('');
    out.push('FAILED:');
    for (const f of report.failures) out.push(`  ${f}`);
  }
  return out;
}

/**
 * The card. It holds no numbers: the host calls it as the legs run and hands in the report when
 * they are done. `onExport` is what a Download press calls, with the same text `reportLines`
 * gives - the host owns the file, never the card.
 * @param {{ onExport?: ((text:string) => void) | null, onClose?: (() => void) | null }} [opts]
 */
export function createBenchOverlay({ onExport = null, onClose = null } = {}) {
  const el = document.createElement('div');
  el.id = 'dfbench';
  el.style.cssText = 'position:fixed;inset:0;z-index:14;display:none;align-items:center;justify-content:center;'
    + 'background:rgba(8,10,12,.72);font:13px/1.45 ui-monospace,Menlo,Consolas,monospace;color:#e9e4d9';
  el.style.display = 'none';   // set on the property too: a stub document only sees the property

  const card = document.createElement('div');
  card.style.cssText = 'box-sizing:border-box;width:min(680px,calc(100vw - 28px));max-height:calc(100vh - 28px);overflow:auto;'
    + 'background:#14161a;border:1px solid #3a3f46;border-radius:12px;padding:16px 18px 14px;box-shadow:0 18px 48px rgba(0,0,0,.55)';
  el.appendChild(card);

  const title = document.createElement('div');
  title.style.cssText = 'font:600 15px/1.3 system-ui,sans-serif;letter-spacing:.02em;margin:0 0 2px';
  title.textContent = 'Benchmark';
  card.appendChild(title);

  const sub = document.createElement('div');
  sub.style.cssText = 'opacity:.72;margin:0 0 12px;font-size:12px';
  sub.textContent = 'the real game, offline';
  card.appendChild(sub);

  const body = document.createElement('pre');
  body.style.cssText = 'margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace';
  body.textContent = '';
  card.appendChild(body);

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:none;gap:8px;justify-content:flex-end;margin-top:14px';
  buttons.style.display = 'none';
  card.appendChild(buttons);

  const mkButton = (label, fn) => {
    const b = document.createElement('div');
    b.style.cssText = 'padding:8px 14px;border-radius:8px;border:1px solid #4a505a;background:#20242a;cursor:pointer;user-select:none';
    b.textContent = label;
    b.onclick = fn;
    buttons.appendChild(b);
    return b;
  };
  mkButton('Copy', () => {
    const text = body.textContent;
    try { globalThis.navigator?.clipboard?.writeText?.(text); } catch { /* a browser that wants a click first; the Download button is the one that always works */ }
  });
  if (onExport) mkButton('Download', () => onExport(body.textContent));
  mkButton('Close', () => { dispose(); if (onClose) onClose(); });

  let live = [];        // the legs as the host reports them, in run order

  // MOUNTED HERE, not by the host: the card is one element a person reads, and a host that built
  // it and forgot to append it would run the whole benchmark in silence (the first draft did - the
  // probe that photographs the card is what caught it). `display:none` until `prepare`, so a boot
  // that never asks for a run shows nothing.
  try { document.body?.appendChild?.(el); } catch { /* a document with no body yet: the element is still the caller's */ }

  function dispose() {
    el.remove();
    el.style.display = 'none';
  }

  return {
    el,
    /** Show the card and lay out the legs it will run, as a checklist. */
    prepare(legs) {
      live = (Array.isArray(legs) ? legs : []).map((l) => ({ id: l.id, title: l.title ?? l.id, state: 'waiting' }));
      body.textContent = live.map((l) => `  \u00b7 ${l.title}`).join('\n');
      buttons.style.display = 'none';
      el.style.display = 'flex';
      return this;
    },
    /** The leg now running, and how far into it (0..1). Rewritten in place: the card must not
     *  build a node a frame, which is the DOM churn that once cost a town three layouts a frame. */
    progress(id, fraction = 0) {
      const i = live.findIndex((l) => l.id === id);
      if (i < 0) return this;
      live[i].state = 'running';
      const width = 24;
      const filled = Math.max(0, Math.min(width, Math.round((Number(fraction) || 0) * width)));
      body.textContent = live.map((l, k) => {
        const mark = l.state === 'done' ? '\u2713' : k === i ? '\u25b6' : ' ';
        const bar = k === i ? ` [${'#'.repeat(filled)}${'.'.repeat(width - filled)}]` : '';
        return `${mark} ${l.title}${bar}`;
      }).join('\n');
      return this;
    },
    /** The leg finished; `summary` is its recorder row, kept only for the checklist's tick. */
    done(id) {
      const l = live.find((x) => x.id === id);
      if (l) l.state = 'done';
      return this;
    },
    /** The run is over: draw the table, the verdict and every failure. */
    finish(report) {
      body.textContent = reportLines(report).join('\n');
      buttons.style.display = 'flex';
      const bad = Array.isArray(report?.failures) && report.failures.length;
      sub.textContent = bad ? 'this run is not a measurement' : `score ${Number.isFinite(report?.score) ? Math.round(report.score) : DASH}`;
      return this;
    },
    /** The run could not even finish (a page error, a leg that never settled). */
    fail(text) {
      body.textContent = String(text ?? 'the run failed');
      buttons.style.display = 'flex';
      sub.textContent = 'this run is not a measurement';
      return this;
    },
    dispose,
  };
}
