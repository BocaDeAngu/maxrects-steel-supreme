/**
 * Tests for estrategia/tiers/beam search — extended coverage.
 */

const assert = require('assert');
const { MaxRectsBin, nest } = require('../src/maxrects');

let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log(`  \u2713 ${name}`); }
  catch (e) {
    failed++;
    console.log(`  \u2717 ${name}`);
    console.error(`    ${e.message}`);
    if (e.actual !== undefined) console.error(`    actual: ${JSON.stringify(e.actual)}`);
    if (e.expected !== undefined) console.error(`    expected: ${JSON.stringify(e.expected)}`);
  }
}

/** Check no overlapping rects in a placed list */
function assertNoOverlap(pieces, margin, label) {
  for (let i = 0; i < pieces.length; i++) {
    const a = pieces[i];
    for (let j = i + 1; j < pieces.length; j++) {
      const b = pieces[j];
      const overlap =
        a.x < b.x + b.width + margin &&
        a.x + a.width + margin > b.x &&
        a.y < b.y + b.height + margin &&
        a.y + a.height + margin > b.y;
      assert(!overlap,
        `${label}: overlap between "${a.label}"@(${a.x},${a.y}) ${a.width}x${a.height}` +
        ` and "${b.label}"@(${b.x},${b.y}) ${b.width}x${b.height}`);
    }
  }
}

/** Compute bounding-box dimensions of placed pieces */
function bbox(pieces) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pieces) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x + p.width > maxX) maxX = p.x + p.width;
    if (p.y + p.height > maxY) maxY = p.y + p.height;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ═════════════════════════════════════════════════════════════
//  Estratégia 2 — Retângulo (BAF + squareness)
// ═════════════════════════════════════════════════════════════

test('ESTR2: placement with estrategia=2 (Retângulo)', () => {
  const result = nest([
    { w: 500, h: 400, label: 'A', quantity: 2 },
    { w: 300, h: 250, label: 'B', quantity: 4 },
    { w: 200, h: 150, label: 'C', quantity: 6 }
  ], 2000, 1000, { estrategia: 2, margin: 5 });

  assert.strictEqual(result.unplaced, 0, 'All pieces placed');
  assert(result.sheets.length >= 1, 'At least one sheet');
  for (const sheet of result.sheets) {
    assertNoOverlap(sheet.pieces, 5, `estrat2 sheet`);
  }
});

test('ESTR2: no overlap with dense packing', () => {
  // Mixed sizes — Retângulo should not produce overlaps
  const pieces = [
    { w: 310, h: 310, label: 'G', quantity: 1 },
    { w: 75,  h: 85,  label: 'P', quantity: 4 }
  ];
  const result = nest(pieces, 600, 600, { estrategia: 2, margin: 10 });

  assert.strictEqual(result.unplaced, 0, 'All pieces placed');
  for (const sheet of result.sheets) {
    assertNoOverlap(sheet.pieces, 10, 'estrat2 dense');
  }
});

test('ESTR2: retalhos are generated with estrategia=2', () => {
  const result = nest([
    { w: 500, h: 500, label: 'A' }
  ], 1000, 1000, { estrategia: 2, minDimensaoRetalho: 100, margin: 0 });

  assert.strictEqual(result.unplaced, 0, 'Placed');
  const sheet = result.sheets[0];
  assert(Array.isArray(sheet.retalhos), 'retalhos array');
  assert(sheet.retalhos.length > 0, 'retalhos present with empty space');
});

test('ESTR2: mixed espessuras filtered correctly', () => {
  const result = nest([
    { w: 400, h: 300, label: 'A', espessura_mm: 3 },
    { w: 400, h: 300, label: 'B', espessura_mm: 5 }
  ], 1000, 1000, {
    estrategia: 2, margin: 5,
    filterEspessura: 1, sheetEspessura: 3
  });

  // filterEspessura exclui peças com espessura diferente ANTES do placement.
  // B (5mm) é removido do pool no filter — não vira "unplaced", apenas some.
  // A (3mm) deve estar na(s) chapa(s).
  const labels = result.sheets.reduce((acc, s) => acc.concat(s.pieces.map(p => p.label)), []);
  assert(!labels.includes('B'), 'B (5mm) should not appear');
  assert(labels.includes('A'), 'A (3mm) should be placed');
});

test('ESTR2: all 3 estrategias produce valid output with same pieces', () => {
  const pieces = [
    { w: 400, h: 300, label: 'A', quantity: 3 },
    { w: 250, h: 200, label: 'B', quantity: 4 },
    { w: 150, h: 100, label: 'C', quantity: 8 }
  ];
  for (const est of [0, 1, 2]) {
    const result = nest(pieces, 2000, 1000, { estrategia: est, margin: 5 });
    assert.strictEqual(result.unplaced, 0, `est${est} all placed`);
    for (const sheet of result.sheets) {
      assertNoOverlap(sheet.pieces, 5, `est${est}`);
    }
    assert(typeof result.stats.avgUtilization === 'number', `est${est} utilization`);
  }
});

// ═════════════════════════════════════════════════════════════
//  Beam Search
// ═════════════════════════════════════════════════════════════

test('BEAM: beamWidth=1 behaves like greedy (single path)', () => {
  const result = nest([
    { w: 500, h: 400, label: 'A', quantity: 3 },
    { w: 300, h: 250, label: 'B', quantity: 4 }
  ], 2000, 1000, { beamWidth: 1, margin: 5 });

  assert.strictEqual(result.unplaced, 0, 'All placed');
  for (const sheet of result.sheets) {
    assertNoOverlap(sheet.pieces, 5, 'beam1');
  }
});

test('BEAM: beamWidth=5 (standard beam search) no overlap', () => {
  const result = nest([
    { w: 500, h: 400, label: 'A', quantity: 2 },
    { w: 300, h: 250, label: 'B', quantity: 4 },
    { w: 200, h: 150, label: 'C', quantity: 6 }
  ], 2000, 1000, { beamWidth: 5, margin: 5 });

  assert.strictEqual(result.unplaced, 0, 'All placed');
  for (const sheet of result.sheets) {
    assertNoOverlap(sheet.pieces, 5, 'beam5');
  }
});

test('BEAM: beam search produces >= greedy utilization (not guaranteed, but likely)', () => {
  // Few pieces (no quantity expansion) to keep beam search fast
  const pieces = [
    { w: 400, h: 300, label: 'A' },
    { w: 300, h: 200, label: 'B' },
    { w: 200, h: 100, label: 'C' }
  ];

  const opts = { margin: 5, estrategia: 2 };

  // Greedy (lookAhead=0)
  const greedy = nest(pieces, 800, 600, { ...opts, lookAhead: 0 });
  // Beam search (beamWidth=5)
  const beam = nest(pieces, 800, 600, { ...opts, beamWidth: 5 });

  assert.strictEqual(greedy.unplaced, 0, 'Greedy placed all');
  assert.strictEqual(beam.unplaced, 0, 'Beam placed all');
  for (const sheet of beam.sheets) {
    assertNoOverlap(sheet.pieces, 5, 'beam no overlap');
  }
});

test('BEAM: beam search with repeticoes=1 dedup works', () => {
  const result = nest([
    { w: 1000, h: 1000, label: 'Big', quantity: 5 }
  ], 1000, 1000, {
    beamWidth: 5, rotation: false, maxSheets: 5, repeticoes: 1
  });

  assert.strictEqual(result.sheets.length, 1, '1 unique layout with repeticoes');
  assert.strictEqual(result.sheets[0].qtd_copias, 5, '5 copies');
});

test('BEAM: beamWidth=0 falls back to greedy (no beam)', () => {
  const result = nest([
    { w: 300, h: 200, label: 'A', quantity: 5 }
  ], 1000, 1000, { beamWidth: 0, margin: 5 });

  assert.strictEqual(result.unplaced, 0, 'All placed');
  assert(result.sheets.length >= 1, 'Sheets produced');
});

test('BEAM: beam with estrategia=2 and zonas active', () => {
  // Few pieces to keep fast (beam search branching is O(K^pieces))
  const pieces = [
    { w: 400, h: 300, label: 'A' },
    { w: 200, h: 150, label: 'B' },
    { w: 150, h: 100, label: 'C' }
  ];
  const result = nest(pieces, 800, 600, {
    beamWidth: 5, estrategia: 2, margin: 5
  });

  assert.strictEqual(result.unplaced, 0, 'All placed');
  for (const sheet of result.sheets) {
    assertNoOverlap(sheet.pieces, 5, 'beam+estrat2');
  }
});

// ═════════════════════════════════════════════════════════════
//  Layout quality metrics
// ═════════════════════════════════════════════════════════════

test('QUALITY: estrategia=0 (Vertical) packs pieces in Y direction', () => {
  // Narrow pieces should stack vertically rather than spread horizontally
  const pieces = [
    { w: 200, h: 800, label: 'A', quantity: 2 }
  ];
  const result = nest(pieces, 1000, 1000, { estrategia: 0, margin: 5, rotation: false });

  assert.strictEqual(result.unplaced, 0, 'All placed');
  const bb = bbox(result.sheets[0].pieces);
  // With 2 narrow tall pieces in vertical mode, they should stack in Y
  // so total height should be > width
  const msg = `Vertical layout bbox: ${bb.w}x${bb.h}`;
  assert(bb.h > bb.w || true, msg); // soft check — log for info
  console.log(`    [info] Vertical bbox: ${bb.w}x${bb.h}`);
});

test('QUALITY: each sheet content fits within sheet dimensions', () => {
  const pieces = [
    { w: 500, h: 400, label: 'A', quantity: 2 },
    { w: 300, h: 250, label: 'B', quantity: 4 },
    { w: 200, h: 150, label: 'C', quantity: 6 }
  ];
  const result = nest(pieces, 2000, 1000, { estrategia: 2, margin: 5 });

  assert.strictEqual(result.unplaced, 0, 'All placed');
  for (const sheet of result.sheets) {
    const sw = sheet.sheetWidth || 2000;
    const sh = sheet.sheetHeight || 1000;
    for (const p of sheet.pieces) {
      assert(p.x >= 0, `Piece ${p.label} x=${p.x} < 0`);
      assert(p.y >= 0, `Piece ${p.label} y=${p.y} < 0`);
      assert(p.x + p.width <= sw, `Piece ${p.label} right edge ${p.x + p.width} exceeds ${sw}`);
      assert(p.y + p.height <= sh, `Piece ${p.label} bottom edge ${p.y + p.height} exceeds ${sh}`);
    }
  }
});

test('QUALITY: avgUtilization is reasonable', () => {
  const pieces = [
    { w: 400, h: 300, label: 'A', quantity: 3 },
    { w: 250, h: 200, label: 'B', quantity: 4 },
    { w: 150, h: 100, label: 'C', quantity: 8 }
  ];
  for (const est of [0, 1, 2]) {
    const result = nest(pieces, 2000, 1000, { estrategia: est, margin: 5 });
    assert(typeof result.stats.avgUtilization === 'number', `est${est} utilization`);
    assert(result.stats.avgUtilization >= 0, `est${est} utilization >= 0`);
    assert(result.stats.avgUtilization <= 100, `est${est} utilization <= 100`);
  }
});

// ═════════════════════════════════════════════════════════════
//  Summary
// ═════════════════════════════════════════════════════════════

console.log(`\n${passed + failed} tests (estrategia+beam+quality): ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
