// h* (altura de fileira ótima): pool com dimensão comum → peças com h* no Y.
// Caso real: folha 34/35 do proj 37 (esp2.25, chapa 3000x1210, margem 2).
const path = require('path');
const assert = require('assert');
const { nest } = require(path.join(__dirname, '..', 'src', 'maxrects'));
const { assertNoOverlap } = require('./helpers');

function folha34Pecas() {
  const pecas = [];
  for (let i = 0; i < 7; i++) pecas.push({ w: 292, h: 402, label: `292x402-${i}` });
  for (let i = 0; i < 12; i++) pecas.push({ w: 318, h: 292, label: `318x292-${i}` });
  for (let i = 0; i < 3; i++) pecas.push({ w: 250, h: 292, label: `250x292-${i}` });
  return pecas;
}

test('h*: peças 402 do pool dominante 292 ficam com 292 no Y', () => {
  const r = nest(folha34Pecas(), 3000, 1210, { margin: 2, estrategia: 2, zonaPct: 1 });
  assert.strictEqual(r.unplaced, 0, `unplaced=${r.unplaced}`);
  const placed = r.sheets.flatMap(s => s.pieces);
  for (const p of placed) {
    assertNoOverlap([p], 3000, 1210, 'folha34');
    if (p.width === 402 || p.height === 402) {
      assert.strictEqual(p.height, 292, `peça 402×292 com 402 no Y (${p.width}x${p.height})`);
    }
  }
  // 4 fileiras de 294 = 1176 ≤ 1206 — nunca 106mm de folga no Y
  const yMax = Math.max(...placed.map(p => p.y + p.height));
  assert.ok(yMax <= 1178, `yMax ${yMax} — fileiras de 292 não alinhadas`);
});

test('h*: peça que entra em pé (292x1187) é girada para 292 no Y', () => {
  const pecas = [];
  for (let i = 0; i < 4; i++) pecas.push({ w: 1771, h: 292, label: `1771-${i}` });
  for (let i = 0; i < 4; i++) pecas.push({ w: 292, h: 1187, label: `1187-${i}` });
  const r = nest(pecas, 3000, 1210, { margin: 2, estrategia: 2, zonaPct: 1 });
  assert.strictEqual(r.unplaced, 0, `unplaced=${r.unplaced}`);
  const placed = r.sheets.flatMap(s => s.pieces);
  for (const p of placed) {
    if (p.width === 1187 || p.height === 1187) {
      assert.strictEqual(p.height, 292, `peça 1187 com 1187 no Y (${p.width}x${p.height})`);
    }
  }
});

test('h* desligado em pool heterogêneo (sem dimensão dominante) — sem regressão', () => {
  const pecas = [];
  for (let i = 0; i < 5; i++) pecas.push({ w: 500, h: 292, label: `a${i}` });
  for (let i = 0; i < 5; i++) pecas.push({ w: 300, h: 400, label: `b${i}` });
  const r = nest(pecas, 3000, 1210, { margin: 2, estrategia: 2, zonaPct: 1 });
  assert.strictEqual(r.unplaced, 0);
  for (const s of r.sheets) assertNoOverlap(s.pieces, s.sheetWidth, s.sheetHeight, 'hetero');
});

test('h* não força quadrada nem peça sem a dimensão dominante', () => {
  const pecas = [
    { w: 292, h: 402, label: 'a' },
    { w: 318, h: 292, label: 'b' },
    { w: 292, h: 318, label: 'c' },
    { w: 500, h: 700, label: 'd' }, // não adota 292 — livre
    { w: 300, h: 300, label: 'e' }  // quadrada — irrelevante
  ];
  const r = nest(pecas, 3000, 1210, { margin: 2, estrategia: 2, zonaPct: 1 });
  assert.strictEqual(r.unplaced, 0);
  for (const s of r.sheets) assertNoOverlap(s.pieces, s.sheetWidth, s.sheetHeight, 'misto');
});

test('h* empate (dimensão w=h igual no pool): fica com a MAIOR — 5×1150x1400 em chapa 1500x6000 cabe 5 na 1ª chapa', () => {
  // Bug: no empate 1150/1400 (mesma contagem), h* pegava a 1ª (1150) e
  // forçava rotação → 4 por chapa (R1400x1150), 2 chapas. Com h*=1400,
  // Y=1400 preenche a largura 1500 e o X empilha 5 (5×1150=5750≤6000).
  const r = nest(
    [{ w: 1150, h: 1400, quantity: 5, label: 'P' }],
    6000, 1500,
    { margin: 0, estrategia: 2, rotation: true }
  );
  assert.strictEqual(r.stats.totalSheets, 1, '5 peças devem caber em 1 chapa');
  const f = r.sheets[0];
  assert.strictEqual(f.pieces.length, 5);
  assert.strictEqual(f.pieces.every(p => !p.rotated), true, 'orientação natural (1150 no X, 1400 no Y)');
  assertNoOverlap(f.pieces, 6000, 1500, 'h* tie');
});
