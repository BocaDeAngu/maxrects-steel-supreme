// Fase 2.1 — variação de ordem por chapa (M5).
// O beam não decide quantas peças entram na chapa; a ORDEM decide.
// O motor testa as 3 ordens canônicas com K reduzido e usa a de menor leftover.
const path = require('path');
const assert = require('assert');
const { nest } = require(path.join(__dirname, '..', 'src', 'maxrects'));
const { assertNoOverlap, pecas } = require('./helpers');

test('fase 2.1: ordem com menor leftover vence (height-desc coloca 3, so D sobra)', () => {
  // Chapa 100x50, maxSheets=1. Sem variação (area-desc fixa): chapa fica D,B e
  // A,C ficam de fora (unplaced 2). Com a melhor ordem (height-desc): A,B,C na
  // chapa e só D de fora (unplaced 1).
  const r = nest(pecas([[100, 30, 'D'], [40, 50, 'A'], [60, 20, 'B'], [60, 20, 'C']]), 100, 50,
    { margin: 0, estrategia: 2, beamWidth: 5, maxSheets: 1 });
  assert.strictEqual(r.unplaced, 1, `unplaced=${r.unplaced}`);
  const nomes = r.sheets[0].pieces.map(p => p.label).sort();
  assert.deepStrictEqual(nomes, ['A', 'B', 'C'], `colocadas=${nomes}`);
  assertNoOverlap(r.sheets[0].pieces, 100, 50, '2.1');
});

test('fase 2.1: leftover da ordem vencedora alimenta a próxima chapa — nada se perde', () => {
  const r = nest(pecas([[100, 30, 'D'], [40, 50, 'A'], [60, 20, 'B'], [60, 20, 'C']]), 100, 50,
    { margin: 0, estrategia: 2, beamWidth: 5 });
  assert.strictEqual(r.unplaced, 0, `unplaced=${r.unplaced}`);
  assert.strictEqual(r.stats.totalSheets, 2, `sheets=${r.stats.totalSheets}`);
  assert.strictEqual(r.sheets.flatMap(s => s.pieces).length, 4);
  for (const s of r.sheets) assertNoOverlap(s.pieces, 100, 50, '2.1-ilimitado');
});
