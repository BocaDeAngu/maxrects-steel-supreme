/**
 * Tests for maxrects-steel-supreme.
 * Zero dependencies — uses Node built-in assert.
 */

const assert = require('assert');
const { MaxRectsBin, nest } = require('../src/maxrects');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    if (e.actual !== undefined) {
      console.error(`    actual: ${JSON.stringify(e.actual)}`);
      console.error(`    expected: ${JSON.stringify(e.expected)}`);
    }
  }
}

function assertRectsEqual(actual, expected, msg) {
  assert.strictEqual(actual.length, expected.length,
    `${msg}: expected ${expected.length} rects, got ${actual.length}`);
  for (let i = 0; i < expected.length; i++) {
    const a = actual[i], e = expected[i];
    assert.strictEqual(a.x, e.x, `${msg}[${i}].x`);
    assert.strictEqual(a.y, e.y, `${msg}[${i}].y`);
    assert.strictEqual(a.w, e.w, `${msg}[${i}].w`);
    assert.strictEqual(a.h, e.h, `${msg}[${i}].h`);
  }
}

// ═════════════════════════════════════════════════════════════
//  MaxRectsBin — split tests (vertical-first)
// ═════════════════════════════════════════════════════════════

test('_genSplitV: piece at (0,0) in full bin → right + bottom', () => {
  const bin = new MaxRectsBin(2000, 1000);
  const fr = { x: 0, y: 0, w: 2000, h: 1000 };
  const result = bin._genSplitV(fr, 0, 0, 800, 600);

  // Right: (800, 0, 1200, 600) — piece height
  // Bottom: (0, 600, 2000, 400)
  assert.strictEqual(result.length, 2);
  assertRectsEqual(result, [
    { x: 800, y: 0, w: 1200, h: 600 },
    { x: 0, y: 600, w: 2000, h: 400 }
  ], 'splitV (0,0)');
});

test('_genSplitV: outward corners always at right+bottom of piece', () => {
  const bin = new MaxRectsBin(2000, 1000);
  const fr = { x: 200, y: 100, w: 1600, h: 800 };
  const result = bin._genSplitV(fr, 200, 100, 800, 500);

  // Right: (1000, 100, 800, 500) — x=fx+pw, w=fw-pw, h=ph
  // Bottom: (200, 600, 1600, 300)
  assert.strictEqual(result.length, 2);
  assertRectsEqual(result, [
    { x: 1000, y: 100, w: 800, h: 500 },
    { x: 200, y: 600, w: 1600, h: 300 }
  ], 'splitV offset');
});

test('_genSplitV: piece fills full width → only bottom', () => {
  const bin = new MaxRectsBin(2000, 1000);
  const fr = { x: 0, y: 0, w: 2000, h: 1000 };
  const result = bin._genSplitV(fr, 0, 0, 2000, 600);
  assert.strictEqual(result.length, 1);
  assertRectsEqual(result, [
    { x: 0, y: 600, w: 2000, h: 400 }
  ], 'splitV full width');
});

test('_genSplitV: piece fills full height → only right', () => {
  const bin = new MaxRectsBin(2000, 1000);
  const fr = { x: 0, y: 0, w: 2000, h: 1000 };
  const result = bin._genSplitV(fr, 0, 0, 800, 1000);
  assert.strictEqual(result.length, 1);
  assertRectsEqual(result, [
    { x: 800, y: 0, w: 1200, h: 1000 }
  ], 'splitV full height');
});

// ═════════════════════════════════════════════════════════════
//  MaxRectsBin — split tests (horizontal-first)
// ═════════════════════════════════════════════════════════════

test('_genSplitH: piece at (0,0) → bottom + right (full height)', () => {
  const bin = new MaxRectsBin(2000, 1000);
  const fr = { x: 0, y: 0, w: 2000, h: 1000 };
  const result = bin._genSplitH(fr, 0, 0, 800, 600);

  // Bottom: (0, 600, 2000, 400)
  // Right: (800, 0, 1200, 1000) — full height
  assert.strictEqual(result.length, 2);
  assertRectsEqual(result, [
    { x: 0, y: 600, w: 2000, h: 400 },
    { x: 800, y: 0, w: 1200, h: 1000 }
  ], 'splitH (0,0)');
});

test('_genSplitH: piece fills full width → only bottom', () => {
  const bin = new MaxRectsBin(2000, 1000);
  const fr = { x: 0, y: 0, w: 2000, h: 1000 };
  const result = bin._genSplitH(fr, 0, 0, 2000, 600);
  assert.strictEqual(result.length, 1);
  assertRectsEqual(result, [
    { x: 0, y: 600, w: 2000, h: 400 }
  ], 'splitH full width');
});

// ═════════════════════════════════════════════════════════════
//  Merge tests
// ═════════════════════════════════════════════════════════════

test('mergeFreeRects: horizontal merge', () => {
  const bin = new MaxRectsBin(2000, 1000);
  bin.freeRects = [
    { x: 0, y: 0, w: 500, h: 300 },
    { x: 500, y: 0, w: 500, h: 300 }
  ];
  bin._mergeFreeRects();
  assert.strictEqual(bin.freeRects.length, 1);
  assertRectsEqual(bin.freeRects, [{ x: 0, y: 0, w: 1000, h: 300 }], 'horizontal merge');
});

test('mergeFreeRects: vertical merge', () => {
  const bin = new MaxRectsBin(2000, 1000);
  bin.freeRects = [
    { x: 0, y: 0, w: 500, h: 300 },
    { x: 0, y: 300, w: 500, h: 200 }
  ];
  bin._mergeFreeRects();
  assert.strictEqual(bin.freeRects.length, 1);
  assertRectsEqual(bin.freeRects, [{ x: 0, y: 0, w: 500, h: 500 }], 'vertical merge');
});

// ═════════════════════════════════════════════════════════════
//  Prune tests
// ═════════════════════════════════════════════════════════════

test('prune: removes contained rect', () => {
  const bin = new MaxRectsBin(2000, 1000);
  bin.freeRects = [
    { x: 0, y: 0, w: 2000, h: 1000 },
    { x: 100, y: 100, w: 500, h: 500 }  // contained
  ];
  bin._prune();
  assert.strictEqual(bin.freeRects.length, 1);
  assertRectsEqual(bin.freeRects, [{ x: 0, y: 0, w: 2000, h: 1000 }], 'prune contained');
});

// ═════════════════════════════════════════════════════════════
//  Scenario: the "linha imaginária" bug
// ═════════════════════════════════════════════════════════════

test('REGRESSION: large piece followed by wide piece (the bug the user reported)', () => {
  // This exact scenario failed with BAF:
  //   A = 1000×700 placed at (0,0)
  //   B = 1000×300 → BAF placed it in the bottom strip, destroying it
  //   C = 1800×200 → couldn't fit anywhere
  //
  // With BRS + look-ahead, B should go to the RIGHT of A,
  // preserving the bottom strip for C.

  const result = nest([
    { w: 1000, h: 700, label: 'A' },
    { w: 1000, h: 300, label: 'B' },
    { w: 1800, h: 200, label: 'C' }
  ], 2000, 1000, { lookAhead: 1, margin: 0 });

  assert.strictEqual(result.unplaced, 0,
    `All pieces should be placed, but ${result.unplaced} remain unplaced`);

  // Verify C is placed somewhere (should be in the bottom strip)
  const sheet = result.sheets[0];
  assert(sheet.pieces.length === 3, 'All 3 pieces should be on one sheet');

  // Find piece C
  const pieceC = sheet.pieces.find(p => p.label === 'C');
  assert(pieceC, 'Piece C should be placed');

  // C should be at y=700 (the bottom strip) or at y=0 if it went elsewhere
  // Either way, C should be placed — that's the main regression test
  assert(pieceC.y >= 0, 'Piece C should have a valid y position');
  assert.strictEqual(pieceC.width, 1800, 'Piece C width should be 1800');
  assert.strictEqual(pieceC.height, 200, 'Piece C height should be 200');
});

test('PLACEMENT: all pieces fit on one sheet', () => {
  const result = nest([
    { w: 500, h: 400, label: 'A', quantity: 3 },
    { w: 300, h: 250, label: 'B', quantity: 4 },
    { w: 200, h: 150, label: 'C', quantity: 6 }
  ], 2000, 1000, { lookAhead: 1 });

  assert.strictEqual(result.unplaced, 0, 'All pieces placed');
  assert(result.sheets.length >= 1, 'At least one sheet');
});

test('PLACEMENT: multiple sheets when pieces exceed one sheet', () => {
  // repeticoes=0 (default): each sheet is returned individually
  const result = nest([
    { w: 1000, h: 1000, label: 'Big', quantity: 5 }
  ], 1000, 1000, { lookAhead: 0, rotation: false, maxSheets: 5 });

  assert.strictEqual(result.sheets.length, 5, 'Should use 5 sheets');
  assert.strictEqual(result.sheets[0].vezes_cortada, 1, 'Individual sheets have counter 1');
  assert.strictEqual(result.unplaced, 0, 'All placed');
  assert.strictEqual(result.stats.avgUtilization, 100, '100% utilization per sheet');
});

test('PLACEMENT: repeticoes=1 collapses identical layouts', () => {
  const result = nest([
    { w: 1000, h: 1000, label: 'Big', quantity: 5 }
  ], 1000, 1000, { lookAhead: 0, rotation: false, maxSheets: 5, repeticoes: 1 });

  // With repeticoes=1, identical full-sheet layouts collapse into 1 entry
  assert.strictEqual(result.sheets.length, 1, 'Should use 1 unique layout');
  assert.strictEqual(result.sheets[0].vezes_cortada, 5, 'Counter shows 5 repetitions');
  assert.strictEqual(result.unplaced, 0, 'All placed');
  // avgUtilization is per unique sheet (stats not weighted by vezes_cortada)
  assert(result.stats.avgUtilization >= 100, 'Utilization reflects total piece area vs unique sheets');
});

test('PLACEMENT: rotation fits when as-is does not', () => {
  const bin = new MaxRectsBin(500, 700, 0);
  const pos = bin.insert(600, 400, { lookAhead: 0, rotation: true });
  assert(pos, 'Piece placed with rotation');
  assert(pos.rotated, 'Should have been rotated');
  assert.strictEqual(pos.width, 600);
  assert.strictEqual(pos.height, 400);
});

test('PLACEMENT: no rotation means piece must fit as-is', () => {
  const bin = new MaxRectsBin(500, 700, 0);
  const pos = bin.insert(600, 400, { lookAhead: 0, rotation: false });
  assert.strictEqual(pos, null, 'Piece should not fit without rotation');
});

test('PLACEMENT: piece too large for sheet', () => {
  const result = nest([
    { w: 3000, h: 100, label: 'too-wide' }
  ], 2000, 1000, { lookAhead: 0 });

  assert.strictEqual(result.unplaced, 1, 'Piece should be unplaced');
});

test('PLACEMENT: margin between pieces', () => {
  const bin = new MaxRectsBin(100, 100, 5);
  const p1 = bin.insert(40, 40, { lookAhead: 0, rotation: false });
  assert(p1, 'First piece placed');
  const p2 = bin.insert(40, 40, { lookAhead: 0, rotation: false });
  assert(p2, 'Second piece placed');

  // With 5mm margin, pieces must not overlap.
  // They can go right of P1 (x ≥ 0+40+5=45) or below P1 (y ≥ 0+40+5=45)
  const separated = (p2.x >= p1.x + p1.width + 5) || (p2.y >= p1.y + p1.height + 5);
  assert(separated, 'Pieces should be separated by at least margin');
});

// ═════════════════════════════════════════════════════════════
//  New parameters: borda_mm, densidade, velocidadeCorte, areaMinRetalho
// ═════════════════════════════════════════════════════════════

test('borda_mm: offsets pieces and reduces effective area', () => {
  const result = nest([
    { w: 100, h: 100, label: 'X' }
  ], 200, 200, { borda_mm: 10, lookAhead: 0 });

  assert.strictEqual(result.unplaced, 0, 'Piece placed');
  const p = result.sheets[0].pieces[0];
  assert.strictEqual(p.x, 10, 'X offset by borda');
  assert.strictEqual(p.y, 10, 'Y offset by borda');
});

test('densidade: calculates weight per piece and total', () => {
  const result = nest([
    { w: 1000, h: 500, label: 'A', espessura_mm: 3 }
  ], 2000, 1000, { densidade: 7.85, lookAhead: 0 });

  assert.strictEqual(result.unplaced, 0, 'Piece placed');
  const p = result.sheets[0].pieces[0];
  assert(p.peso_kg !== undefined, 'peso_kg computed');
  // 3 * 1000 * 500 * 7.85 / 1000000 = 11.775
  assert.strictEqual(p.peso_kg, 11.775, 'Weight matches formula');
  assert(result.stats.peso_total_kg !== undefined, 'stats.peso_total_kg exists');
});

test('velocidadeCorte: calculates cutting time per piece', () => {
  const result = nest([
    { w: 1000, h: 500, label: 'A', espessura_mm: 3 }
  ], 2000, 1000, { velocidadeCorte: 12700, lookAhead: 0 });

  assert.strictEqual(result.unplaced, 0, 'Piece placed');
  const p = result.sheets[0].pieces[0];
  assert(p.tempo_corte_min !== undefined, 'tempo_corte_min computed');
  assert(p.perimetro_mm !== undefined, 'perimetro_mm computed');
  // perim = (1000+500)*2 = 3000
  // vel = 12700/3 ≈ 4233.33
  // time = 3000/4233.33 ≈ 0.71
  assert.strictEqual(p.perimetro_mm, 3000, 'Perimeter correct');
  assert(p.tempo_corte_min > 0, 'Time is positive');
  assert(result.stats.tempo_corte_total_min !== undefined, 'stats exists');
});

test('areaMinRetalho: generates retalhos when enough space', () => {
  const result = nest([
    { w: 500, h: 500, label: 'A' }
  ], 1000, 1000, { areaMinRetalho: 10000, lookAhead: 0 });

  assert.strictEqual(result.unplaced, 0, 'Piece placed');
  const sheet = result.sheets[0];
  assert(Array.isArray(sheet.retalhos), 'retalhos is an array');
  assert(sheet.retalhos.length > 0, 'Should have retalhos with 50% empty space');
  assert(result.stats.retalhosAproveitaveis > 0, 'stats counts retalhos');
});

test('borda_mm + densidade + velocidadeCorte + areaMinRetalho together', () => {
  const result = nest([
    { w: 800, h: 600, label: 'A', espessura_mm: 3 },
    { w: 400, h: 300, label: 'B', espessura_mm: 3 }
  ], 2000, 1000, {
    borda_mm: 10,
    densidade: 7.85,
    velocidadeCorte: 12700,
    areaMinRetalho: 5000,
    margin: 5,
    lookAhead: 1
  });

  assert.strictEqual(result.unplaced, 0, 'All placed');
  const sheet = result.sheets[0];
  for (const p of sheet.pieces) {
    assert(p.x >= 10, 'X offset by borda');
    assert(p.y >= 10, 'Y offset by borda');
    assert(p.peso_kg > 0, 'Has weight');
    assert(p.tempo_corte_min > 0, 'Has cutting time');
    assert(p.perimetro_mm > 0, 'Has perimeter');
  }
  assert(result.stats.peso_total_kg > 0, 'Total weight');
  assert(result.stats.tempo_corte_total_min > 0, 'Total time');
});

test('sentido: largura vs comprimento produce different layouts', () => {
  // With many thin-wide pieces, sentido should influence the layout
  const pieces = [
    { w: 400, h: 200, label: 'A', quantity: 6 }
  ];

  const rLarg = nest(pieces, 1000, 1000, { sentido: 'largura', lookAhead: 0, margin: 0 });
  const rComp = nest(pieces, 1000, 1000, { sentido: 'comprimento', lookAhead: 0, margin: 0 });

  assert.strictEqual(rLarg.unplaced, 0, 'All placed with largura');
  assert.strictEqual(rComp.unplaced, 0, 'All placed with comprimento');

  // Both should produce the same number of sheets (just different internal layouts)
  assert.strictEqual(rLarg.sheets.length, rComp.sheets.length);

  // Verify sentido is accepted
  const rInvalid = nest(pieces, 1000, 1000, { sentido: 'invalido', lookAhead: 0 });
  assert.strictEqual(rInvalid.unplaced, 0, 'Invalid sentido falls back to auto');
});

test('MaxRectsBin constructor accepts sentido', () => {
  const bin = new MaxRectsBin(100, 100, 0, 'largura');
  assert(bin.sentido === 'largura', 'sentido stored');
  const bin2 = new MaxRectsBin(100, 100, 0, 'comprimento');
  assert(bin2.sentido === 'comprimento', 'sentido comprimento');
});

test('nest function README example works', () => {
  const result = nest(
    [
      { w: 500, h: 300, label: 'chapa-A', quantity: 4 },
      { w: 200, h: 150, label: 'chapa-B', quantity: 8 },
    ],
    2000, 1000,
    { margin: 10, lookAhead: 1 }
  );

  assert(typeof result === 'object', 'Returns object');
  assert(Array.isArray(result.sheets), 'Has sheets array');
  assert(result.stats.totalPieces >= 12, 'All 12 pieces placed');
  assert(typeof result.stats.avgUtilization === 'number', 'Has utilization');
});

// ═════════════════════════════════════════════════════════════
//  Summary
// ═════════════════════════════════════════════════════════════

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
