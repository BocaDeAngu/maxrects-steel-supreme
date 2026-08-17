// Multi-sheet: ordem de grupos (asc/desc) + filtro espessura/material SEM perda.
// Bug corrigido: filterEspessura/filterMaterial descartavam peças incompatíveis
// permanentemente (data loss silencioso em modos com grupos heterogêneos).
const path = require('path');
const assert = require('assert');
const { nest } = require(path.join(__dirname, '..', 'src', 'maxrects'));
const { assertNoOverlap } = require('./helpers');

// Cenário real: 2 chapas (1500x6000 e 2550x12000), 5 peças 1140x1400.
// Custo ∝ área → o nesting deve encher primeiro a CHAPA MENOR (asc-area default).
test('multi-sheet: menor chapa primeiro (custo/área)', () => {
  const r = nest(
    [{ w: 1140, h: 1400, quantity: 5, espessura_mm: 3, label: 'P' }],
    [
      { width: 1500, height: 6000, espessura_mm: 3, count: 1 },
      { width: 2550, height: 12000, espessura_mm: 3, count: 1 }
    ],
    { margin: 0, filterEspessura: 1 }
  );
  assert.strictEqual(r.unplaced, 0, 'todas as peças colocadas');
  assert.strictEqual(r.sheets.length, 2, '1 chapa pequena (4 peças) + 1 grande (1 peça)');
  const pequena = r.sheets[0];
  assert.strictEqual(pequena.sheetWidth, 1500, 'primeiro grupo processado = menor chapa');
  assert.strictEqual(pequena.sheetHeight, 6000);
  assert.strictEqual(pequena.pieces.length, 4, '1500x6000 cabe 4 peças de 1140x1400');
  const grande = r.sheets[1];
  assert.strictEqual(grande.sheetWidth, 2550);
  assert.strictEqual(grande.pieces.length, 1, 'sobra 1 peça para a grande');
  assertNoOverlap(pequena.pieces, 1500, 6000, 'pequena');
  assertNoOverlap(grande.pieces, 2550, 12000, 'grande');
});

test('multi-sheet: sheetOrder desc-area processa a maior primeiro', () => {
  const r = nest(
    [{ w: 1140, h: 1400, quantity: 5, espessura_mm: 3, label: 'P' }],
    [
      { width: 1500, height: 6000, espessura_mm: 3, count: 1 },
      { width: 2550, height: 12000, espessura_mm: 3, count: 1 }
    ],
    { margin: 0, filterEspessura: 1, sheetOrder: 'desc-area' }
  );
  assert.strictEqual(r.unplaced, 0);
  assert.strictEqual(r.sheets[0].sheetWidth, 2550, 'desc-area deve começar pela maior');
});

test('multi-sheet: filtro por espessura não descarta peças de outros grupos (data loss fix)', () => {
  // 2 peças 3mm + 2 peças 6mm; grupos de chapas 3mm e 6mm.
  // Antes do fix: grupo 3mm descartava as de 6mm → grupo 6mm não achava nada → unplaced errado.
  const r = nest(
    [
      { w: 300, h: 300, quantity: 2, espessura_mm: 3, label: 'e3' },
      { w: 300, h: 300, quantity: 2, espessura_mm: 6, label: 'e6' }
    ],
    [
      { width: 1000, height: 1000, espessura_mm: 3, count: 1 },
      { width: 1000, height: 1000, espessura_mm: 6, count: 1 }
    ],
    { margin: 0, filterEspessura: 1 }
  );
  assert.strictEqual(r.unplaced, 0, 'nenhuma peça perdida');
  const totalPlacements = r.sheets.reduce((s, sh) => s + sh.pieces.length, 0);
  assert.strictEqual(totalPlacements, 4, 'todas as 4 peças alocadas nos grupos certos');
  const e3Sheet = r.sheets.find(s => s.espessura_mm === 3);
  const e6Sheet = r.sheets.find(s => s.espessura_mm === 6);
  assert.ok(e3Sheet && e3Sheet.pieces.every(p => p.espessura_mm === 3), 'chapa 3mm só tem peças 3mm');
  assert.ok(e6Sheet && e6Sheet.pieces.every(p => p.espessura_mm === 6), 'chapa 6mm só tem peças 6mm');
});

test('multi-sheet: filtro por material não descarta peças de outros grupos', () => {
  const r = nest(
    [
      { w: 300, h: 300, quantity: 2, material: 'aco', label: 'A' },
      { w: 300, h: 300, quantity: 2, material: 'inox', label: 'B' }
    ],
    [
      { width: 1000, height: 1000, material: 'aco', count: 1 },
      { width: 1000, height: 1000, material: 'inox', count: 1 }
    ],
    { margin: 0, filterMaterial: 1 }
  );
  assert.strictEqual(r.unplaced, 0);
  const totalPlacements = r.sheets.reduce((s, sh) => s + sh.pieces.length, 0);
  assert.strictEqual(totalPlacements, 4);
  const acoSheet = r.sheets.find(s => s.chapaMaterial === 'aco' || s.material === 'aco');
  const inoxSheet = r.sheets.find(s => s.chapaMaterial === 'inox' || s.material === 'inox');
  assert.ok(acoSheet && acoSheet.pieces.every(p => p.material === 'aco'), 'chapa aco só tem peças aco');
  assert.ok(inoxSheet && inoxSheet.pieces.every(p => p.material === 'inox'), 'chapa inox só tem peças inox');
});

test('multi-sheet: peça incompatível com todos os grupos → unplaced honesto (não perdida)', () => {
  const r = nest(
    [{ w: 300, h: 300, quantity: 1, espessura_mm: 10, label: 'e10' }],
    [
      { width: 1000, height: 1000, espessura_mm: 3, count: 1 },
      { width: 1000, height: 1000, espessura_mm: 6, count: 1 }
    ],
    { margin: 0, filterEspessura: 1 }
  );
  assert.strictEqual(r.unplaced, 1, 'peça 10mm não casa com nenhum grupo → unplaced, não sumida');
  assert.strictEqual(r.sheets.length, 0);
});