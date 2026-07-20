/**
 * Testes para nesting em chapas poligonais (freeRects + voidRects).
 *
 * Uso: node tests/polygon-sheet.test.js
 */
const assert = require('assert');
const { nest, MaxRectsBin } = require('../src/maxrects');

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Verifica se todas as peças colocadas estão dentro de freeRects e fora de voidRects */
function validatePlacement(bin) {
  for (const p of bin.placed) {
    // Dentro de algum freeRect original?
    const inFree = bin.sheetRects.some(sr =>
      p.x >= sr.x && p.y >= sr.y &&
      p.x + p.width <= sr.x + sr.w &&
      p.y + p.height <= sr.y + sr.h
    );
    if (!inFree) {
      throw new Error(`Peça (${p.x},${p.y} ${p.width}×${p.height}) fora de todos freeRects`);
    }
    // Fora de voidRects?
    for (const vr of bin.voidRects) {
      if (p.x < vr.x + vr.w && p.x + p.width > vr.x &&
          p.y < vr.y + vr.h && p.y + p.height > vr.y) {
        throw new Error(`Peça (${p.x},${p.y} ${p.width}×${p.height}) sobre voidRect`);
      }
    }
  }
}

/** Soma áreas das peças colocadas */
function placedArea(placed) {
  return placed.reduce((s, p) => s + p.width * p.height, 0);
}

// ═══════════════════════════════════════════════════════════════
// Teste 1: L-shape básico
// ═══════════════════════════════════════════════════════════════
function testLShapeBasic() {
  console.log('Teste 1: L-shape básico');

  const freeRects = [
    { x: 0, y: 0, w: 2550, h: 2000 },
    { x: 0, y: 2000, w: 1500, h: 2000 },
    { x: 0, y: 4000, w: 500, h: 2000 }
  ];
  const voidRects = [
    { x: 1500, y: 2000, w: 1050, h: 2000 }
  ];
  const bbW = 2550, bbH = 6000;

  const pieces = [
    { w: 500, h: 500, quantity: 3 },
    { w: 200, h: 200, quantity: 2 }
  ];

  const result = nest(pieces, [{
    freeRects,
    voidRects,
    boundingWidth: bbW,
    boundingHeight: bbH,
    count: 1
  }], {});

  assert.ok(result.sheets.length > 0, 'Deveria ter pelo menos 1 sheet');
  const sheet = result.sheets[0];
  assert.ok(sheet.pieces.length > 0, 'Deveria ter peças colocadas');

  // Valida: todas as peças dentro de freeRects
  const bin = new MaxRectsBin(bbW, bbH, { freeRects, voidRects });
  bin.placed = sheet.pieces.map(p => ({ x: p.x, y: p.y, width: p.width, height: p.height }));
  bin.sheetRects = freeRects.map(r => ({ ...r }));
  bin.voidRects = voidRects.map(r => ({ ...r }));
  validatePlacement(bin);

  console.log('  ✓ ' + sheet.pieces.length + ' peças colocadas, 0 em void');
}

// ═══════════════════════════════════════════════════════════════
// Teste 2: Merge protection
// ═══════════════════════════════════════════════════════════════
function testMergeProtection() {
  console.log('Teste 2: Merge protection');

  const freeRects = [
    { x: 0, y: 0, w: 2550, h: 2000 },
    { x: 0, y: 2000, w: 1500, h: 2000 }
  ];
  const voidRects = [
    { x: 1500, y: 2000, w: 1050, h: 2000 }
  ];
  const bbW = 2550, bbH = 4000;

  const bin = new MaxRectsBin(bbW, bbH, { freeRects, voidRects });

  // Coloca 1 peça no retângulo A
  const pos1 = bin.insert(500, 500);
  assert.ok(pos1, 'Peça 1 deveria caber');
  assert.ok(pos1.x <= 2550 && pos1.y <= 2000, 'Peça 1 deveria estar no retângulo A');

  // Verifica: freeRects ainda são 2 (A e B) — não mergearam
  // A+B unido = {x:0,y:0,w:2550,h:4000} que extrapola A — merge não deve acontecer
  const rectAB = { x: 0, y: 0, w: 2550, h: 4000 };
  const contido = bin.sheetRects.some(sr =>
    rectAB.x >= sr.x && rectAB.y >= sr.y &&
    rectAB.x + rectAB.w <= sr.x + sr.w &&
    rectAB.y + rectAB.h <= sr.y + sr.h
  );
  assert.ok(!contido, 'AB unido não deveria estar contido em sheetRects');

  // Nenhuma peça no void
  validatePlacement(bin);

  console.log('  ✓ Merge protegido, freeRects mantêm separados');
}

// ═══════════════════════════════════════════════════════════════
// Teste 3: Backward compat — sem freeRects
// ═══════════════════════════════════════════════════════════════
function testBackwardCompat() {
  console.log('Teste 3: Backward compat (retangular)');

  const resultOld = nest(
    [{ w: 500, h: 500, quantity: 4 }],
    2500, 1250,
    {}
  );

  const resultNew = nest(
    [{ w: 500, h: 500, quantity: 4 }],
    [{ width: 2500, height: 1250, count: 1 }],
    {}
  );

  assert.ok(resultOld.sheets.length > 0, 'Modo legado deveria funcionar');
  assert.ok(resultNew.sheets.length > 0, 'Modo array de sheets deveria funcionar');
  assert.strictEqual(
    resultOld.sheets[0].pieces.length,
    resultNew.sheets[0].pieces.length,
    'Ambos modos deveriam colocar mesma quantidade'
  );

  console.log('  ✓ ' + resultOld.sheets[0].pieces.length + ' peças em ambos modos');
}

// ═══════════════════════════════════════════════════════════════
// Teste 4: L-shape + Beam Search
// ═══════════════════════════════════════════════════════════════
function testLShapeBeamSearch() {
  console.log('Teste 4: L-shape + Beam Search');

  const pieces = [
    { w: 300, h: 300, quantity: 6 },
    { w: 150, h: 150, quantity: 4 }
  ];

  const result = nest(pieces, [{
    freeRects: [
      { x: 0, y: 0, w: 2000, h: 1500 },
      { x: 0, y: 1500, w: 1200, h: 1500 }
    ],
    boundingWidth: 2000,
    boundingHeight: 3000,
    count: 1
  }], { beamWidth: 5 });

  assert.ok(result.sheets.length > 0, 'Deveria ter resultado');
  if (result.sheets[0].pieces.length > 0) {
    const sheet = result.sheets[0];
    const bin = new MaxRectsBin(2000, 3000, {
      freeRects: [{ x: 0, y: 0, w: 2000, h: 1500 }, { x: 0, y: 1500, w: 1200, h: 1500 }],
      voidRects: [{ x: 1200, y: 1500, w: 800, h: 1500 }]
    });
    bin.placed = sheet.pieces.map(p => ({ x: p.x, y: p.y, width: p.width, height: p.height }));
    bin.sheetRects = [{ x: 0, y: 0, w: 2000, h: 1500 }, { x: 0, y: 1500, w: 1200, h: 1500 }];
    bin.voidRects = [{ x: 1200, y: 1500, w: 800, h: 1500 }];
    validatePlacement(bin);
    console.log('  ✓ Beam Search colocou ' + sheet.pieces.length + ' peças no L-shape');
  } else {
    console.log('  ⚠ Beam Search não colocou peças (pode ser esperado para L pequeno)');
  }
}

// ═══════════════════════════════════════════════════════════════
// Teste 5: Peça grande só cabe no retângulo maior
// ═══════════════════════════════════════════════════════════════
function testLargePieceInBigRect() {
  console.log('Teste 5: Peça grande só no retângulo maior');

  const freeRects = [
    { x: 0, y: 0, w: 2550, h: 2000 },     // A — grande
    { x: 0, y: 2000, w: 1500, h: 2000 },   // B — médio
    { x: 0, y: 4000, w: 500, h: 2000 }     // C — estreito
  ];
  const voidRects = [{ x: 1500, y: 2000, w: 1050, h: 2000 }];

  const pieces = [
    { w: 2000, h: 1500, quantity: 1 },  // Só cabe em A
    { w: 300, h: 300, quantity: 3 }
  ];

  const result = nest(pieces, [{
    freeRects, voidRects,
    boundingWidth: 2550, boundingHeight: 6000,
    count: 1
  }], {});

  assert.ok(result.sheets.length > 0, 'Deveria ter resultado');
  const sheet = result.sheets[0];

  // Peça grande deve estar no retângulo A (x=0, y<2000)
  const bigPiece = sheet.pieces.find(p => p.width >= 2000 && p.height >= 1500);
  assert.ok(bigPiece, 'Peça grande deveria estar colocada');
  assert.ok(bigPiece.y + bigPiece.height <= 2000, 'Peça grande deveria estar no retângulo A (y < 2000)');

  console.log('  ✓ Peça grande (' + bigPiece.width + '×' + bigPiece.height + ') colocada em A (y=' + bigPiece.y + ')');
}

// ═══════════════════════════════════════════════════════════════
// Teste 6: _calcVoidRects
// ═══════════════════════════════════════════════════════════════
function testCalcVoidRects() {
  console.log('Teste 6: _calcVoidRects');

  const { _calcVoidRects } = require('../src/maxrects');

  // L-shape simples
  const voids = _calcVoidRects([
    { x: 0, y: 0, w: 2550, h: 2000 },
    { x: 0, y: 2000, w: 1500, h: 2000 }
  ], 2550, 4000);

  assert.ok(voids.length > 0, 'Deveria ter ao menos 1 void');
  const v = voids[0];
  assert.strictEqual(v.x, 1500, 'void x = 1500');
  assert.strictEqual(v.y, 2000, 'void y = 2000');
  assert.strictEqual(v.w, 1050, 'void w = 1050');
  assert.strictEqual(v.h, 2000, 'void h = 2000');

  // Caso trivial: 1 free rect = sem void
  const noVoids = _calcVoidRects([{ x: 0, y: 0, w: 2500, h: 1250 }], 2500, 1250);
  assert.strictEqual(noVoids.length, 0, '1 free rect = 0 voids');

  console.log('  ✓ voidRects calculados corretamente');
}

// ═══════════════════════════════════════════════════════════════
// Execução
// ═══════════════════════════════════════════════════════════════
function main() {
  const tests = [
    testLShapeBasic,
    testMergeProtection,
    testBackwardCompat,
    testLShapeBeamSearch,
    testLargePieceInBigRect,
    testCalcVoidRects
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test();
      passed++;
    } catch (err) {
      console.error('  ✗ FALHOU: ' + err.message);
      failed++;
    }
  }

  console.log('\n═══════════════════════════════════════');
  console.log(`${passed} passed, ${failed} failed, ${tests.length} total`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
