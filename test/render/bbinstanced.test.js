// @ts-check
// BB-INSTANCED: ONE COPY OF A PICTURE'S QUADS, MANY PLACES, AND THE RANGE GIVEN BACK ONLY BY THE LAST OF THEM.
//
// The census of 2026-10-19 measured a town frame at 683 billboard draws for 93 pictures - the place was a UNIFORM, so
// 653 different places meant 653 draws of the same quads. The billboard pass now shares one arena range between every
// batch standing the same picture (createBillboardBatch) and draws a run of them in one `drawElementsInstanced`, the
// places riding a divisor-1 attribute. This file pins the two halves that make that safe:
//
//   1. THE SHARING: two batches of one record, the same quads, are ONE range and ONE draw of two copies.
//   2. THE REFCOUNT: the range goes back to the arena's free list only when the LAST batch standing it is freed. Giving
//      it back early would hand it to another picture, and the cards still drawing it would wear that picture - the silent
//      wrong sprite this law exists for (test/render/perfarena.test.js's "a batch's life" is the same law, unshared).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, WORLD_FRAME } from '../../src/render/renderer.js';
import { perspective, lookAt, mirrorProjectionX } from '../../src/world/mat4.js';

const ARRAY = 34962, ELEMENT = 34963;
const PROJ = mirrorProjectionX(perspective(Math.PI / 3, 1.6, 0.1, 4000));
const VIEW = lookAt([0, 8, 20], [0, 0, 0], [0, 1, 0]);
const RIGHT = new Float32Array([1, 0, 0]), UP = new Float32Array([0, 1, 0]);

/** A GL that records every call and keeps its buffers' bytes, like the model GL of perfarena.test.js, cut to what this
 *  file reads: the draws, their instance counts, and the places a run uploads. */
function fakeGl() {
  let ids = 0, arrayBuf = null, vao = null;
  const bufs = new Map(), calls = [];
  const consts = { ARRAY_BUFFER: ARRAY, ELEMENT_ARRAY_BUFFER: ELEMENT, TEXTURE0: 1000, TEXTURE1: 1001, TEXTURE2: 1002, DEPTH_BUFFER_BIT: 256, COLOR_BUFFER_BIT: 16384 };
  const copy = (d) => new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
  const fns = {
    createVertexArray: () => ({ id: ++ids }),
    bindVertexArray: (v) => { vao = v; },
    bindBuffer: (t, b) => { if (t === ARRAY) arrayBuf = b; },
    bufferData: (t, data) => { bufs.set(arrayBuf, typeof data === 'number' ? new Uint8Array(data) : copy(data)); },
    bufferSubData: (t, at, data, src = 0, len = undefined) => {
      const per = data.BYTES_PER_ELEMENT, n = len ?? data.length - src;
      const bytes = new Uint8Array(data.buffer, data.byteOffset + src * per, n * per);
      const into = bufs.get(arrayBuf);
      if (into) into.set(bytes, at);
    },
  };
  const gl = new Proxy({}, {
    get(_, k) {
      if (k in consts) return consts[k];
      if (k in fns) return (...a) => { calls.push([k, ...a]); return fns[/** @type {string} */ (k)](...a); };
      if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
      if (k === 'getUniformLocation') return (_p, n) => n;
      if (k === 'getAttribLocation') return () => 0;
      if (typeof k === 'string' && k.startsWith('create')) return () => ({ id: ++ids });
      if (k === 'getParameter') return () => new Float32Array(4);
      if (typeof k === 'string' && k.toUpperCase() === k) return 1;
      if (k === 'drawElementsInstanced') return (...a) => calls.push(['drawElementsInstanced', ...a]);
      if (k === 'drawElements') return (...a) => calls.push(['drawElements', ...a]);
      if (k === 'uniform2f' || k === 'uniform3f') return (...a) => calls.push([k, ...a]);
      return (...a) => calls.push([/** @type {string} */ (k), ...a]);
    },
  });
  return { gl, calls, bufs };
}

test('BB-INSTANCED: two batches standing one picture share ONE range, are drawn in ONE call of two copies - and the range stays until the last of them lets go', () => {
  const { gl, calls } = fakeGl();
  const canvas = { getContext: () => gl, clientWidth: 320, clientHeight: 200, width: 320, height: 200 };
  const r = new Renderer(canvas);
  r._bbCullOff = true;
  r.textures.set('504_1', { id: 'pic' });
  r.setLighting(new Float32Array([0.3, 0.3, 0.3]), 1);
  // the same picture's quads, built twice - a record stood in two map pixels is exactly this: same centres, own place
  const quads = [[1, 0, 1], [3, 0, 2]];
  const a = r.createBillboardBatch(504, 1, { w: 2, h: 6 }, quads);
  const b = r.createBillboardBatch(504, 1, { w: 2, h: 6 }, quads);
  a.origin = [0, 0, 0]; b.origin = [10, 0, 0];
  assert.equal(a.vao, b.vao, 'one arena array for both');
  assert.equal(a._ibOff, b._ibOff, 'and one range of its indices - the quads are not copied a place');
  assert.equal(a._q0, b._q0);
  const slot = r._bbSlots.get('504_1');
  assert.ok(slot, 'the picture is kept by its record');
  assert.equal(slot.refs, 2, 'and two places stand it');
  const arena = slot.arena;

  r.beginFrame(PROJ, VIEW, new Float32Array([0.3, 0.8, 0.2]), WORLD_FRAME);
  r.drawBillboards([a, b], RIGHT, UP);
  const runs = calls.filter((c) => c[0] === 'drawElementsInstanced');
  assert.equal(runs.length, 1, 'ONE call for the two copies');
  assert.equal(runs[0][5], 2, 'and its instance count is the two');
  assert.equal(calls.filter((c) => c[0] === 'drawElements').length, 0, 'no per-copy draw beside it');

  // A DIFFERENT PICTURE IS ITS OWN RANGE, even at the same size and count: the content is what is shared
  const other = r.createBillboardBatch(504, 2, { w: 2, h: 6 }, [[0, 0, 0], [1, 0, 1]]);
  assert.notEqual(other._ibOff, a._ibOff, 'another picture, another range');
  // and a record whose quads CHANGED is not the picture the range was built for: the content check refuses it, so it
  // takes a range of its own rather than wearing the old quads at a new shape
  const first = r.createBillboardBatch(504, 9, { w: 2, h: 6 }, quads);
  const second = r.createBillboardBatch(504, 9, { w: 2, h: 6 }, [[7, 0, 7]]);
  assert.notEqual(first.vao === second.vao && first._ibOff === second._ibOff, true, 'the same record in another shape is another range');
  r.destroyBillboardBatch(first); r.destroyBillboardBatch(second);

  // THE PLACES ARE THE DRAW'S, NOT THE ARRAY'S. Left enabled on the arena's array, attribute 5 would be instance 0's place
  // on every OTHER draw of that array - a run of one, a concealed flat, the air pass's bloom of a lamp, a shadow caster -
  // and each would land where the last run's first copy stood. The enable is scoped to the one instanced draw.
  const seq = calls.filter((c) => ((c[0] === 'enableVertexAttribArray' || c[0] === 'disableVertexAttribArray') && c[1] === 5) || c[0] === 'drawElementsInstanced');
  assert.deepEqual(seq.map((c) => c[0]), ['enableVertexAttribArray', 'drawElementsInstanced', 'disableVertexAttribArray'], 'the places enabled for the run and given back after it');
  assert.ok(!calls.some((c) => c[0] === 'enableVertexAttribArray' && c[1] === 5 && c !== seq[0]), 'enabled nowhere but that run');

  // A SHARED RANGE IS NOT ONE BATCH'S TO REWRITE (PROF4: a felled tree's flat sunk in its wood, the day's turn standing it
  // again). Moving one of two places that stand the same picture takes a range of its own first, and the other keeps its
  // quads - and the slot's own copy of them still describes what is in the arena.
  const c1 = r.createBillboardBatch(600, 1, { w: 1, h: 2 }, [[0, 0, 0]]);
  const c2 = r.createBillboardBatch(600, 1, { w: 1, h: 2 }, [[0, 0, 0]]);
  c1.origin = [0, 0, 0]; c2.origin = [5, 0, 0];
  assert.equal(c1._ibOff, c2._ibOff, 'one picture, one range, two places');
  r.moveBillboardBatch(c1, [[9, 0, 9]]);
  assert.notEqual(c1._ibOff, c2._ibOff, 'the moved one has a range of its own now');
  assert.equal(r._bbSlots.get('600_1').verts[0], 0, 'and the picture\'s own quads are untouched (the x of its first corner)');
  r.destroyBillboardBatch(c1); r.destroyBillboardBatch(c2);

  // THE REFCOUNT: one place lets go, the range stands for the other
  const freeBefore = [...arena.free];
  r.destroyBillboardBatch(a);
  assert.deepEqual(arena.free, freeBefore, 'the range was NOT given back while the second place still draws it');
  assert.equal(r._bbSlots.get('504_1').refs, 1);
  calls.length = 0;
  r.beginFrame(PROJ, VIEW, new Float32Array([0.3, 0.8, 0.2]), WORLD_FRAME);
  r.drawBillboards([b], RIGHT, UP);
  assert.equal(calls.filter((c) => c[0] === 'drawElements' || c[0] === 'drawElementsInstanced').length, 1, 'the survivor still draws its picture');
  assert.ok(!calls.some((c) => c[0] === 'drawElementsInstanced'), 'a run of one draws as its own draw, with no places to carry');

  // the last one lets go: the range goes back, and the record is forgotten
  r.destroyBillboardBatch(b);
  assert.ok(!r._bbSlots.has('504_1'), 'no range kept for a picture nobody stands');
  assert.notDeepEqual(arena.free, freeBefore, 'and the range is in the free list again');
});
