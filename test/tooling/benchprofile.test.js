// BENCH1 (2026-10-19) - THE PROFILER'S PURE HALF, PINNED WHERE IT NOW LIVES.
// tools/cpuReport.mjs is a script: importing it launches a browser and profiles
// whatever is on the screen. BENCH1 must reuse its reading of a V8 profile rather
// than grow a second sampler, so the four pure functions moved whole to
// tools/lib/cpuProfile.mjs - and this is the file that keeps the two from drifting
// back apart. Every number below is worked out on paper from a payload the test
// builds by hand (self time per function, the delta a sample is charged when its
// own is missing, bytes by the allocating frame). The last test reads cpuReport.mjs
// as TEXT, deliberately: importing it would run it and open a page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregate, aggregateAlloc, parsePerf } from '../../tools/lib/cpuProfile.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
/** Microseconds to the milliseconds the report prints. */
const ms = (us) => us / 1000;
/** A callFrame as V8 reports one: line and column are 0-based, the report's are 1-based. */
const frame = (functionName, url = '', lineNumber = -1) => ({ functionName, url, lineNumber });

test('BENCH1: aggregate sums SELF time per function - src/ frames are game code, a URL-less frame is (native), (idle) is its own row, and the total is the deltas it was given', () => {
  // Six samples of a made-up window, added up by hand:
  //   hotLoop         300 + 500 + 200 = 1000 us   the world host's own frame function (lineNumber 41)
  //   drawMesh         200 us                    a renderer frame, its ?v=2 query stripped
  //   (idle)          1000 us                    its own row, never folded into (native)
  //   glDrawElements   100 us                    V8 gives it no url, so it is (native)
  //   (program)          -                       a node in the payload no sample landed on: no row at all
  const profile = {
    nodes: [
      { id: 1, callFrame: frame('(root)') },
      { id: 2, callFrame: frame('hotLoop', 'http://localhost:5173/src/scenes/world.js', 41) },
      { id: 3, callFrame: frame('drawMesh', 'http://localhost:5173/src/render/renderer.js?v=2', 299) },
      { id: 4, callFrame: frame('(idle)') },
      { id: 5, callFrame: frame('glDrawElements') },
      { id: 6, callFrame: frame('(program)') },
    ],
    samples: [2, 2, 3, 4, 5, 2],
    timeDeltas: [300, 500, 200, 1000, 100, 200],
    startTime: 1000000,
    endTime: 3300000,
  };
  const { list, totalUs, wallSeconds, samples } = aggregate(profile);
  const row = (fn) => list.find((r) => r.fn === fn);

  assert.equal(samples, 6);
  assert.equal(totalUs, 2300, 'the deltas, summed - the wall time the sampler actually covered');
  assert.equal(ms(totalUs), 2.3);
  assert.equal(wallSeconds, 2.3, 'endTime - startTime, in seconds');
  assert.equal(list.length, 4, 'the unsampled (program) node is not a row');
  assert.deepEqual(list.map((r) => r.fn), ['hotLoop', '(idle)', 'drawMesh', 'glDrawElements'],
    'descending by self time, and a tie keeps the order the samples first named it');

  const hot = row('hotLoop');
  assert.equal(hot.us, 1000);
  assert.equal(ms(hot.us), 1);
  assert.equal(hot.file, 'src/scenes/world.js');
  assert.equal(hot.line, 42, 'V8 line numbers are 0-based, the report places are 1-based');
  assert.equal(hot.game, true, 'a src/ frame is the game own code');

  const draw = row('drawMesh');
  assert.equal(draw.us, 200);
  assert.equal(ms(draw.us), 0.2);
  assert.equal(draw.file, 'src/render/renderer.js', 'a cache-busting query is not part of the place');
  assert.equal(draw.line, 300);
  assert.equal(draw.game, true);

  const idle = row('(idle)');
  assert.equal(idle.us, 1000);
  assert.equal(ms(idle.us), 1);
  assert.equal(idle.file, '(idle)', 'the idle bucket is named (idle), never (native)');
  assert.equal(idle.line, 0);
  assert.equal(idle.game, false);

  const native = row('glDrawElements');
  assert.equal(native.us, 100);
  assert.equal(ms(native.us), 0.1);
  assert.equal(native.file, '(native)');
  assert.equal(native.line, 0);
  assert.equal(native.game, false);

  assert.equal(row('(program)'), undefined, 'a node no sample landed on is not a row');
  const gameUs = list.filter((r) => r.game).reduce((a, r) => a + r.us, 0);
  assert.equal(ms(gameUs), 1.2, 'the two src/ rows together: 1.0 + 0.2 ms');
});

test('BENCH1: aggregate charges a sample with no timeDeltas[i] the interval it was given - 250 by default, the profiler script own sampling interval', () => {
  const nodes = [
    { id: 1, callFrame: frame('a', 'http://localhost:5173/src/a.js', 0) },
    { id: 2, callFrame: frame('b', 'http://localhost:5173/src/b.js', 0) },
  ];
  // No timeDeltas at all: every sample is charged the fallback.
  assert.equal(aggregate({ nodes, samples: [1, 2] }).totalUs, 500, 'two samples at the default 250 us');
  assert.equal(aggregate({ nodes, samples: [1, 2], timeDeltas: [] }).totalUs, 500, 'an empty delta list is a missing delta at every index');
  assert.equal(aggregate({ nodes, samples: [1, 2] }, 1000).totalUs, 2000, 'SAMPLING says the interval, and the caller may say another');
  assert.equal(aggregate({ nodes, samples: [1, 2] }, undefined).totalUs, 500, 'undefined keeps the default, which is 250 and not a caller number');

  // A delta that IS there is used as measured and never replaced by the fallback.
  const mixed = { nodes, samples: [1, 2, 1], timeDeltas: [400] };
  assert.equal(aggregate(mixed, 40).totalUs, 480, '400 as measured + 40 + 40 for the two samples the payload left out');
  assert.deepEqual(aggregate(mixed, 40).list.map((r) => r.us), [440, 40], 'the measured delta stays with its own sample');
});

test('BENCH1: a built bundle (/assets/main-abc.js) is game code, with the column that names the function inside it', () => {
  // The deployed site has no /src/ path to match: vite bundles the whole source into
  // /assets/<name>-<hash>.js and every function sits on line 1, so the COLUMN is the
  // part that identifies it. The first cut of this classified the bundle as
  // "everything else" and then refused its own report over a world running perfectly.
  const profile = {
    nodes: [{ id: 7, callFrame: { ...frame('hotLoop', 'https://daggerfalljs.dev/assets/main-abc.js', 0), columnNumber: 20480 } }],
    samples: [7],
    timeDeltas: [250],
  };
  const [row] = aggregate(profile).list;
  assert.equal(row.file, 'assets/main-abc.js');
  assert.equal(row.line, 1);
  assert.equal(row.col, 20481, 'columnNumber is 0-based too, so a bundle place is a line and a column to find');
  assert.equal(row.game, true, 'the built site is the game too - "game code 0.0%" was the report lying about a live world');
  assert.equal(ms(row.us), 0.25);
});

test('BENCH1: parsePerf reads both shapes and never confuses them - a count is not a zone, and a main-thread tiling (?perf=cpu) is never printed as the GPU', () => {
  // The two shapes perfMeter.js prints, and the units that tell them apart: a count has
  // no decimal point (`draws 1210`, `sun 3c/12d`), a zone is always toFixed(2) (`shadow 9.10`).
  const plain = parsePerf(['[perf] gpu 21.40ms | draws 1210 | sun 3c/12d | lanterns 4k/12f/9d']);
  assert.equal(plain.gpuMs, 21.4);
  assert.equal(plain.cpuMs, null, 'the plain line carries no CPU clock');
  assert.deepEqual(plain.zones, [], 'nothing on it is a pass');
  assert.deepEqual(plain.counts, ['draws 1210', 'sun 3c/12d', 'lanterns 4k/12f/9d'], 'a count has no decimal point, so it stays a count');
  assert.equal(plain.body, 'gpu 21.40ms | draws 1210 | sun 3c/12d | lanterns 4k/12f/9d');
  assert.equal(plain.seen, 1);

  // The zone line without the unit on its total: `gpu 9.10` is a bare decimal, so the
  // reader sees a pass named gpu beside the real passes - and still no CPU number.
  const zoned = parsePerf(['[perf] gpu 9.10 | shadow 9.10 | grass 3.20 | draws 1210']);
  assert.equal(zoned.cpuMs, null);
  assert.deepEqual(zoned.zones, [['gpu', 9.1], ['shadow', 9.1], ['grass', 3.2]]);
  assert.deepEqual(zoned.counts, ['draws 1210'], 'draws is a count on a zone line too');
  assert.equal(zoned.gpuMs, null, 'a unitless `gpu 9.10` is not the GPU total - the unit is what says a total is one');

  // The shape perfMeter.js's own perfZoneLine writes, with the total carrying its unit:
  // the total is the GPU's and the rest are the passes that tiled it.
  const produced = parsePerf(['[perf] gpu 9.10ms | shadow 9.10 | grass 3.20 | draws 1210']);
  assert.equal(produced.gpuMs, 9.1);
  assert.equal(produced.cpuMs, null);
  assert.deepEqual(produced.zones, [['shadow', 9.1], ['grass', 3.2]]);

  // ?perf=cpu tiles the frame on the MAIN THREAD clock (perfMeter.js's PERF-CPU arm).
  // Printed as the GPU's, the same milliseconds would be counted twice and the report
  // would invent a split out of them - the lie its own comment names.
  const cpu = parsePerf(['[perf] cpu 14.20ms | walk 6.10 | draws 1210']);
  assert.equal(cpu.cpuMs, 14.2);
  assert.equal(cpu.gpuMs, null, 'a main-thread tiling is not the GPU clock');
  assert.deepEqual(cpu.zones, [['walk', 6.1]]);
  assert.deepEqual(cpu.counts, ['draws 1210']);

  // `gpu n/a` is the browser refusing EXT_disjoint_timer_query_webgl2: neither clock.
  const refused = parsePerf(['[perf] gpu n/a | draws 1210 | lanterns 4k/12f/9d']);
  assert.equal(refused.gpuMs, null, 'a refused timer is not a zero');
  assert.equal(refused.cpuMs, null);
  assert.deepEqual(refused.counts, ['draws 1210', 'lanterns 4k/12f/9d'], 'and the counts are still worth reading');

  // The LAST line is the one kept: it is the mean of the frames the recording ended on.
  const last = parsePerf(['[perf] gpu 30.00ms | draws 900 | frame 33.30', '[perf] gpu 21.40ms | draws 1210']);
  assert.equal(last.gpuMs, 21.4);
  assert.equal(last.seen, 2);

  // No line at all is no reading, never a zero.
  assert.equal(parsePerf([]), null);
  assert.equal(parsePerf(null), null);
  assert.equal(parsePerf(['']), null);
});

test('BENCH1: aggregateAlloc sums SELF bytes by the allocating function, merges one function stack into one row, and answers null with no head', () => {
  // Three allocations by hand: makeMesh twice on the same line (the report's key is
  // function + file + line, so the two merge) and a dependency's texture alloc.
  const head = {
    selfSize: 0,
    callFrame: frame('(root)'),
    children: [
      {
        selfSize: 4096,
        callFrame: frame('makeMesh', 'http://localhost:5173/src/world/mesh.js', 9),
        children: [{ selfSize: 8192, callFrame: frame('makeMesh', 'http://localhost:5173/src/world/mesh.js', 9) }],
      },
      // no children array at all: a leaf the walker must not trip over
      { selfSize: 2048, callFrame: frame('makeTexture', 'http://localhost:5173/node_modules/.vite/deps/three.js', 3) },
    ],
  };
  const { list, total } = aggregateAlloc({ head });
  assert.equal(total, 14336, '4096 + 8192 + 2048 bytes');
  assert.deepEqual(list.map((r) => r.fn), ['makeMesh', 'makeTexture'], 'descending by self bytes');
  assert.equal(list[0].bytes, 12288, 'the two allocations on one line are one row');
  assert.equal(list[0].file, 'src/world/mesh.js');
  assert.equal(list[0].line, 10);
  assert.equal(list[0].game, true);
  assert.equal(list[1].bytes, 2048);
  assert.equal(list[1].file, 'node_modules/three.js', 'a dependency keeps its bare node_modules name');
  assert.equal(list[1].game, false);

  // No head is no profile: null, not an empty table a reader would take for "nothing allocated".
  assert.equal(aggregateAlloc(null), null);
  assert.equal(aggregateAlloc({}), null);
  assert.equal(aggregateAlloc({ head: null }), null);
});

test('BENCH1: the source pin - cpuReport.mjs imports the three pure functions from ./lib/cpuProfile.mjs and defines none of the four any more', () => {
  // readFileSync, not an import: importing cpuReport.mjs runs it - it launches a
  // browser, boots a world and profiles it. The pin is on the text for that reason.
  const src = read('tools/cpuReport.mjs');
  const imported = src.match(/import\s*\{([^}]*)\}\s*from\s*'\.\/lib\/cpuProfile\.mjs';/);
  assert.ok(imported, 'cpuReport.mjs imports ./lib/cpuProfile.mjs');
  assert.deepEqual(
    imported[1].split(',').map((s) => s.trim()).filter(Boolean).sort(),
    ['aggregate', 'aggregateAlloc', 'parsePerf'],
    'the three it calls, and framePlace is not among them - it is used only inside the two aggregates that moved with it',
  );
  for (const fn of ['aggregate', 'aggregateAlloc', 'parsePerf', 'framePlace']) {
    assert.equal(src.includes(`function ${fn}(`), false, `cpuReport.mjs defines ${fn} again - the move has drifted back apart`);
  }
  assert.ok(/aggregate\(profile,\s*SAMPLING\)/.test(src),
    'the script passes its own SAMPLING interval, so a --sampling run reads exactly as it did before the move');
  // ... and the library it imports is free of a browser, so a benchmark can import it.
  assert.equal(/^\s*import\s/m.test(read('tools/lib/cpuProfile.mjs')), false,
    'tools/lib/cpuProfile.mjs imports nothing: importing it launches nothing');
});
