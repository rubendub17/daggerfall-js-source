// @ts-check
// EARLY-CULL (2026-10-20): the lit pass's cell cull. The dungeon level is one merged mesh, so nothing could be culled
// per piece until the merge also kept its triangles PER PICTURE AND PER CELL (staticBatch.js cellRunsBySubMesh) -
// shadowCells' runs are one per cell and carry no picture, which a lit draw needs. The pins here are the two that
// matter: the runs LOSE NOTHING (every triangle of the merge is in exactly one run, each run holds only its own
// picture's vertices, and each run's sphere bounds its own triangles), and the cull is the FRUSTUM's alone - a cell
// outside the view is dropped, a cell in front of the eye is kept. (A line of sight was tried and removed: at 16-unit
// cells a room's floor and ceiling occupy the cells a sight line crosses, so an occupancy test is wrong, not
// conservative - see _cellVisible's note.)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Renderer } from '../../src/render/renderer.js';
import { cellRunsBySubMesh, SHADOW_CELL_SIZE } from '../../src/render/staticBatch.js';
import { spherePlanes } from '../../src/render/bounds.js';

/** Two pictures over four quads: a near pair at z = -8 and a far pair at z = -40, x = 0 and 20. */
function twoPictures() {
  const positions = [];
  for (const q of [{ z: -8, x: 0 }, { z: -8, x: 20 }, { z: -40, x: 0 }, { z: -40, x: 20 }]) {
    positions.push(q.x, 0, q.z, q.x + 1, 0, q.z, q.x + 1, 1, q.z, q.x, 1, q.z);
  }
  const indices = [];
  for (let q = 0; q < 4; q++) { const b = q * 4; indices.push(b, b + 2, b + 1, b, b + 3, b + 2); }
  const subMeshes = [
    { textureArchive: 1, textureRecord: 1, startIndex: 0, primitiveCount: 4 },
    { textureArchive: 1, textureRecord: 2, startIndex: 12, primitiveCount: 4 },
  ];
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices), subMeshes };
}

test('EARLY-CULL: the cell runs lose nothing - a run list per picture, every triangle once, a sphere that holds its own triangles, and the runs tiling the index buffer', () => {
  const { positions, indices, subMeshes } = twoPictures();
  const { indices: out, runs } = cellRunsBySubMesh(positions, indices, subMeshes, SHADOW_CELL_SIZE);
  assert.equal(out.length, indices.length, 'the same triangle count');
  assert.equal(runs.length, subMeshes.length, 'a run list per picture');
  let at = 0;
  for (let s = 0; s < runs.length; s++) {
    const sm = subMeshes[s];
    const own = new Set();
    for (let k = 0; k < sm.primitiveCount * 3; k++) own.add(indices[sm.startIndex + k]);
    for (const run of runs[s]) {
      assert.ok(run.primitiveCount > 0, 'a run draws something');
      assert.equal(run.startIndex, at, 'the runs tile the buffer, in order');
      at += run.primitiveCount * 3;
      for (let t = 0; t < run.primitiveCount * 3; t++) {
        const v = out[run.startIndex + t];
        assert.ok(own.has(v), 'a run holds only its own picture\'s vertices');
        const o = v * 3;
        const dx = positions[o] - run.cx, dy = positions[o + 1] - run.cy, dz = positions[o + 2] - run.cz;
        assert.ok(Math.sqrt(dx * dx + dy * dy + dz * dz) <= run.r + 1e-4, 'the run\'s sphere holds its own triangles');
      }
    }
    // the picture's two quads are eight units apart in z but both under one cell row? no: -8 and -40 are cells -1 and -3
    assert.equal(runs[s].length, 2, `${s}: one run a cell the picture stands in`);
  }
  assert.equal(at, out.length, 'every triangle of the merge is in exactly one run');
});

test('EARLY-CULL: the cull is the frustum\'s alone - a cell in front of the eye is kept, the one behind it and the one past the far edge are dropped', () => {
  const f = 1 / Math.tan(Math.PI / 8);   // 90 degrees, looking down -Z
  const pv = new Float32Array([f, 0, 0, 0, 0, f, 0, 0, 0, 0, -1.002, -1, 0, 0, -0.2, 0]);
  const fake = /** @type {any} */ ({ _cellPlanes: spherePlanes(pv, new Float32Array(24)), _cellVisible: Renderer.prototype._cellVisible });
  assert.equal(fake._cellVisible({ cx: 0.5, cy: 0.5, cz: -8, r: 1.5 }), true, 'a near cell in front');
  assert.equal(fake._cellVisible({ cx: 0.5, cy: 0.5, cz: -40, r: 1.5 }), true, 'a far cell in front');
  assert.equal(fake._cellVisible({ cx: 0.5, cy: 0.5, cz: 40, r: 1.5 }), false, 'behind the eye: dropped');
  assert.equal(fake._cellVisible({ cx: 400, cy: 0.5, cz: -8, r: 1.5 }), false, 'far off to the side: dropped');
  assert.equal(fake._cellVisible({ cx: 0.5, cy: 0.5, cz: -8, r: 40 }), true, 'a sphere overlapping the frustum is kept, never dropped');
});
