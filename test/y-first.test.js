// Supreme: esgota Y da coluna atual antes de abrir nova coluna em X.
const path = require('path');
const assert = require('assert');
const { nest } = require(path.join(__dirname, '..', 'src', 'maxrects'));
const { assertNoOverlap } = require('./helpers');

function runTwoPieces(beamWidth) {
  return nest([
    { w: 40, h: 40, label: 'A' },
    { w: 40, h: 40, label: 'B' }
  ], 100, 100, {
    estrategia: 2,
    rotation: false,
    maxSheets: 1,
    ...(beamWidth === undefined ? {} : { beamWidth })
  });
}

test('Supreme padrão: última peça usa Y antes de expandir X', () => {
  const r = runTwoPieces();
  assert.strictEqual(r.unplaced, 0);
  const pieces = r.sheets[0].pieces;
  const a = pieces.find(p => p.label === 'A');
  const b = pieces.find(p => p.label === 'B');
  assert.strictEqual(a.x, 0);
  assert.strictEqual(a.y, 0);
  assert.strictEqual(b.x, 0, 'B deveria permanecer na coluna de A');
  assert.strictEqual(b.y, a.height, 'B deveria ser empilhada em Y');
  assertNoOverlap(pieces, 100, 100, 'Y-first beam');
});

test('Supreme greedy: mesma política Y-first quando beam é desativado', () => {
  const r = runTwoPieces(0);
  assert.strictEqual(r.unplaced, 0);
  const pieces = r.sheets[0].pieces;
  const a = pieces.find(p => p.label === 'A');
  const b = pieces.find(p => p.label === 'B');
  assert.strictEqual(b.x, a.x);
  assert.strictEqual(b.y, a.y + a.height);
  assertNoOverlap(pieces, 100, 100, 'Y-first greedy');
});

test('Supreme: rotação continua respeitando Y-first', () => {
  const r = nest([
    { w: 40, h: 40, label: 'A' },
    { w: 50, h: 20, label: 'B' }
  ], 100, 100, { estrategia: 2, beamWidth: 0, rotation: true, maxSheets: 1 });
  assert.strictEqual(r.unplaced, 0);
  const pieces = r.sheets[0].pieces;
  const a = pieces.find(p => p.label === 'A');
  const b = pieces.find(p => p.label === 'B');
  assert.strictEqual(b.x, a.x);
  assert.ok(b.y >= a.y + a.height);
  assertNoOverlap(pieces, 100, 100, 'Y-first rotation');
});

test('Supreme: margem mantém coluna antes de expandir X', () => {
  const r = nest([
    { w: 40, h: 40, label: 'A' },
    { w: 40, h: 40, label: 'B' }
  ], 100, 100, { estrategia: 2, rotation: true, margin: 5, maxSheets: 1 });
  assert.strictEqual(r.unplaced, 0);
  const pieces = r.sheets[0].pieces;
  const a = pieces.find(p => p.label === 'A');
  const b = pieces.find(p => p.label === 'B');
  assert.strictEqual(b.x, a.x);
  assert.strictEqual(b.y, a.y + a.height + 5);
  assertNoOverlap(pieces, 100, 100, 'Y-first margin');
});

test('Supreme: abre X somente quando Y não comporta próxima peça', () => {
  const r = nest([
    { w: 40, h: 40, label: 'A' },
    { w: 40, h: 40, label: 'B' },
    { w: 40, h: 40, label: 'C' }
  ], 100, 100, { estrategia: 2, rotation: false, maxSheets: 1 });
  assert.strictEqual(r.unplaced, 0);
  const pieces = r.sheets[0].pieces;
  const firstColumn = pieces.filter(p => p.x === 0);
  assert.strictEqual(firstColumn.length, 2);
  assert.ok(pieces.some(p => p.x > 0), 'C deveria abrir X após esgotar Y');
  assertNoOverlap(pieces, 100, 100, 'Y-first rollover');
});
