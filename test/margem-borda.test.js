// Task 0069 — Semântica margem × borda:
// margin = distância entre PEÇAS; peça↔borda da área útil é o border do
// sheet (borda_mm). A peça REAL deve ser aceita contra a borda mesmo
// quando a faixa de margin transborda a área útil (buraco interno entre
// peças JAMAIS aceita transbordo).
const path = require('path');
const assert = require('assert');
const { nest } = require(path.join(__dirname, '..', 'src', 'maxrects'));
const { assertNoOverlap, pecas } = require('./helpers');

const CHAPA = [2560, 6000];

test('T1 margem-borda: peça 2550×5990 cabe em 2560×6000 (borda 4, margem 10)', () => {
  const r = nest(pecas([[2550, 5990, 'P1']]), ...CHAPA, { margin: 10, borda_mm: 4 });
  assert.strictEqual(r.unplaced, 0, `unplaced=${r.unplaced}`);
  assert.strictEqual(r.sheets.length, 1, `sheets=${r.sheets.length}`);
  const p = r.sheets[0].pieces[0];
  assert.strictEqual(p.width, 2550);
  assert.strictEqual(p.height, 5990);
  // Peça real dentro da área útil (chapa − 2×borda): effX = x − 4
  assert.ok((p.x - 4) + p.width <= 2552 + 1e-6, `peça estoura área útil X (${p.x}+${p.width})`);
  assert.ok((p.y - 4) + p.height <= 5992 + 1e-6, `peça estoura área útil Y (${p.y}+${p.height})`);
  assertNoOverlap(r.sheets[0].pieces, 2560, 6000, 'T1');
  // Faixa de margin transbordada vira perda real — minDimensaoRetalho filtra (sem retalho fantasma)
  const rs = nest(pecas([[2550, 5990, 'P1']]), ...CHAPA, { margin: 10, borda_mm: 4, minDimensaoRetalho: 100 });
  assert.deepStrictEqual(rs.sheets[0].retalhos, []);
});

test('T1b beam (estrategia 2): mesma peça aceita no caminho do cortemes', () => {
  const r = nest(pecas([[2550, 5990, 'P1']]), ...CHAPA, { margin: 10, borda_mm: 4, estrategia: 2 });
  assert.strictEqual(r.unplaced, 0, `unplaced=${r.unplaced}`);
  assert.strictEqual(r.sheets.length, 1, `sheets=${r.sheets.length}`);
  const p = r.sheets[0].pieces[0];
  assert.ok((p.x - 4) + p.width <= 2552 + 1e-6, `peça estoura área útil X (${p.x}+${p.width})`);
  assert.ok((p.y - 4) + p.height <= 5992 + 1e-6, `peça estoura área útil Y (${p.y}+${p.height})`);
  assertNoOverlap(r.sheets[0].pieces, 2560, 6000, 'T1b');
});

for (const extra of [{}, { estrategia: 2 }]) {
  test(`T2 margem preservada entre peças${extra.estrategia !== undefined ? ' (beam)' : ''}`, () => {
    const r = nest(pecas([[2400, 550, 'A'], [2400, 550, 'B']]), 2500, 1250, { margin: 10, ...extra });
    assert.strictEqual(r.unplaced, 0);
    const ps = r.sheets[0].pieces;
    assert.strictEqual(ps.length, 2);
    assertNoOverlap(ps, 2500, 1250, 'T2');
    ps.sort((a, b) => a.y - b.y);
    const gap = ps[1].y - (ps[0].y + ps[0].height);
    assert.ok(gap >= 10 - 1e-6, `gap entre peças = ${gap} (< margem 10)`);
  });
}

for (const extra of [{}, { estrategia: 2 }]) {
  test(`T3 buraco interno: 2500×3000 + 2550×2900 no mesmo sheet, gap 10${extra.estrategia !== undefined ? ' (beam)' : ''}`, () => {
    const r = nest(pecas([[2500, 3000, 'A'], [2550, 2900, 'B']]), ...CHAPA, { margin: 10, borda_mm: 4, ...extra });
    assert.strictEqual(r.unplaced, 0, `unplaced=${r.unplaced}`);
    assert.strictEqual(r.sheets.length, 1);
    const ps = r.sheets[0].pieces;
    assert.strictEqual(ps.length, 2);
    assertNoOverlap(ps, 2560, 6000, 'T3');
    // A em cima (0..3000); B colada abaixo com gap exato de 10 (faixa de
    // margin de B transborda a borda direita do fr, não o espaço de A)
    const a = ps.find(p => p.width === 2500);
    const b = ps.find(p => p.width === 2550);
    assert.strictEqual(a.y, 4);
    assert.strictEqual(b.y, a.y + a.height + 10);
    assert.strictEqual(b.height, 2900);
  });
}

test('T3b sem espaço real: 2500×3000 + 2550×3000 não dividem a mesma chapa', () => {
  const r = nest(pecas([[2500, 3000, 'A'], [2550, 3000, 'B']]), ...CHAPA, { margin: 10, borda_mm: 4 });
  // Ordem área-desc coloca B (maior) primeiro; B ocupa o sheet inteiro e
  // A não cabe no fundo (3000 real > sobra 2982) → nada ilegal, 2 chapas.
  assert.strictEqual(r.unplaced, 0);
  assert.strictEqual(r.sheets.length, 2, `sheets=${r.sheets.length}`);
  for (const s of r.sheets) {
    assert.strictEqual(s.pieces.length, 1);
    assertNoOverlap(s.pieces, 2560, 6000, 'T3b');
  }
});

test('T4 rotação: 5990×2550 só cabe rotacionada (borda 4, margem 10)', () => {
  const semRot = nest(pecas([[5990, 2550, 'P']]), ...CHAPA, { margin: 10, borda_mm: 4, rotation: false });
  assert.strictEqual(semRot.unplaced, 1, 'rotation=false deve deixar unplaced');
  assert.strictEqual(semRot.sheets.length, 0);
  const comRot = nest(pecas([[5990, 2550, 'P']]), ...CHAPA, { margin: 10, borda_mm: 4, rotation: true, estrategia: 2 });
  assert.strictEqual(comRot.unplaced, 0, `rotation=true unplaced=${comRot.unplaced}`);
  assert.strictEqual(comRot.sheets.length, 1);
  const p = comRot.sheets[0].pieces[0];
  assert.strictEqual(p.rotated, true);
  assert.ok(p.width <= 2560, `rotacionada largura ${p.width}`);
  assertNoOverlap(comRot.sheets[0].pieces, 2560, 6000, 'T4');
});

test('T5 guilhotina (estrategia 3): peça 2550×5990 aceita', () => {
  const r = nest(pecas([[2550, 5990, 'P1']]), ...CHAPA, { margin: 10, borda_mm: 4, estrategia: 3 });
  assert.strictEqual(r.unplaced, 0, `unplaced=${r.unplaced}`);
  assert.strictEqual(r.sheets.length, 1, `sheets=${r.sheets.length}`);
  const p = r.sheets[0].pieces[0];
  assert.strictEqual(p.width, 2550);
  assert.strictEqual(p.height, 5990);
  assertNoOverlap(r.sheets[0].pieces, 2560, 6000, 'T5');
});