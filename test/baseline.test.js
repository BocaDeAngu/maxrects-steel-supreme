// Testes de sanidade do motor — rede de segurança antes das fases de correção de métricas.
const path = require('path');
const assert = require('assert');
const { nest } = require(path.join(__dirname, '..', 'src', 'maxrects'));

function assertNoOverlap(pieces, sheetW, sheetH, msg = '') {
  for (const p of pieces) {
    assert.ok(p.x >= -1e-6 && p.y >= -1e-6, `${msg} peça ${p.label || '?'} fora da origem (${p.x},${p.y})`);
    assert.ok(p.x + p.width <= sheetW + 1e-6, `${msg} peça ${p.label || '?'} estoura X (${p.x}+${p.width} > ${sheetW})`);
    assert.ok(p.y + p.height <= sheetH + 1e-6, `${msg} peça ${p.label || '?'} estoura Y (${p.y}+${p.height} > ${sheetH})`);
  }
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i], b = pieces[j];
      const overlap = a.x < b.x + b.width - 1e-6 && b.x < a.x + a.width - 1e-6 &&
                      a.y < b.y + b.height - 1e-6 && b.y < a.y + a.height - 1e-6;
      assert.ok(!overlap, `${msg} overlap entre ${a.label || i} e ${b.label || j}`);
    }
  }
}

function pecas(lista) {
  return lista.map(([w, h, label]) => ({ w, h, label: label || `${w}x${h}` }));
}

test('legacy simples: todas as peças cabem, sem overlap', () => {
  const r = nest(pecas([[100, 50], [100, 50], [100, 50]]), 200, 100, { margin: 0 });
  assert.strictEqual(r.unplaced, 0);
  assert.strictEqual(r.stats.totalSheets, 1);
  const pieces = r.sheets[0].pieces;
  assert.strictEqual(pieces.length, 3);
  assertNoOverlap(pieces, 200, 100, 'legacy');
});

test('peça maior que a chapa vai para unplaced', () => {
  const r = nest(pecas([[300, 300], [50, 50]]), 200, 200, { margin: 0 });
  assert.strictEqual(r.unplaced, 1);
  assert.strictEqual(r.sheets.length, 1);
  assert.strictEqual(r.sheets[0].pieces.length, 1);
});

test('margin impede segunda peça na mesma chapa, permite em chapa maior', () => {
  // peça 100 + margin 10 → espaço reservado 110; chapa 210x120 só comporta 1 em X
  const justa = nest(pecas([[100, 100], [100, 100]]), 210, 120, { margin: 10, rotation: false });
  assert.strictEqual(justa.sheets.length, 2, 'chapa 210 deve exigir 2 chapas (1 peça cada)');
  for (const s of justa.sheets) assert.strictEqual(s.pieces.length, 1);
  // chapa 220x120 comporta 2 na mesma chapa (110×2)
  const folgada = nest(pecas([[100, 100], [100, 100]]), 220, 120, { margin: 10, rotation: false });
  assert.strictEqual(folgada.sheets.length, 1, 'chapa 220 deve caber 2 na mesma chapa');
  assert.strictEqual(folgada.sheets[0].pieces.length, 2);
});

test('beam (estrategia 2, beamWidth 5): peças variadas sem overlap', () => {
  const r = nest(pecas([
    [300, 200], [250, 150], [120, 90], [80, 80], [60, 40],
    [200, 100], [150, 150], [90, 70], [50, 50], [400, 300]
  ]), 1000, 500, { margin: 10, estrategia: 2, beamWidth: 5, zonaPct: 1 });
  const placed = r.sheets.flatMap(s => s.pieces);
  assert.strictEqual(r.unplaced, 0, `unplaced=${r.unplaced}`);
  assert.strictEqual(placed.length, 10, `colocadas=${placed.length}`);
  assertNoOverlap(placed, 1000, 500, 'beam5');
});

test('beam default (estrategia 2, beamWidth 35): sem overlap, peças preservadas', () => {
  const pecasList = pecas([
    [350, 250], [300, 200], [250, 150], [200, 200], [150, 100],
    [120, 120], [100, 80], [90, 60], [70, 70], [50, 30],
    [280, 140], [180, 120], [130, 90], [60, 60], [40, 40]
  ]);
  const r = nest(pecasList, 1200, 600, { margin: 10, estrategia: 2, zonaPct: 1 });
  const placed = r.sheets.flatMap(s => s.pieces);
  assert.strictEqual(r.unplaced, 0, `unplaced=${r.unplaced}`);
  assert.strictEqual(placed.length, pecasList.length);
  for (const s of r.sheets) assertNoOverlap(s.pieces, 1200, 600, `sheet ${s.sheetWidth}x${s.sheetHeight}`);
});

test('multi-sheet: peças excedentes do grupo menor passam para o maior', () => {
  // 8 peças 100x100; grupo 200x200 (área menor, processado 1º) cabe 4,
  // as 4 restantes vão para o grupo 300x300 → 2 sheets, nenhuma perdida
  const r = nest(pecas([[100, 100], [100, 100], [100, 100], [100, 100], [100, 100], [100, 100], [100, 100], [100, 100]]),
    [{ width: 200, height: 200, count: 0 }, { width: 300, height: 300, count: 0 }],
    { margin: 0, estrategia: 2, beamWidth: 5 });
  assert.strictEqual(r.stats.totalSheets, 2, `sheets=${r.stats.totalSheets}`);
  assert.strictEqual(r.unplaced, 0);
  assert.strictEqual(r.sheets.flatMap(s => s.pieces).length, 8);
  for (const s of r.sheets) assertNoOverlap(s.pieces, s.sheetWidth, s.sheetHeight, 'multi');
});

test('estrategia 0 (vertical) e 1 (horizontal): sem overlap', () => {
  const lista = pecas([
    [300, 200], [250, 150], [120, 90], [80, 80], [60, 40],
    [200, 100], [150, 150], [90, 70], [50, 50], [400, 300]
  ]);
  for (const est of [0, 1]) {
    const r = nest(lista, 1000, 500, { margin: 10, estrategia: est });
    const placed = r.sheets.flatMap(s => s.pieces);
    assert.strictEqual(r.unplaced, 0, `estrategia ${est}: unplaced=${r.unplaced}`);
    assertNoOverlap(placed, 1000, 500, `estrategia ${est}`);
  }
});

test('sortMode width-desc e height-desc: executam sem erro e sem overlap', () => {
  const lista = pecas([
    [300, 200], [250, 150], [120, 90], [80, 80], [60, 40],
    [200, 100], [150, 150], [90, 70], [50, 50], [400, 300]
  ]);
  for (const sortMode of ['width-desc', 'height-desc', 'area-desc']) {
    const r = nest(lista, 1000, 500, { margin: 10, estrategia: 2, beamWidth: 5, sortMode });
    const placed = r.sheets.flatMap(s => s.pieces);
    assert.strictEqual(r.unplaced, 0, `sortMode ${sortMode}: unplaced=${r.unplaced}`);
    assertNoOverlap(placed, 1000, 500, `sortMode ${sortMode}`);
  }
});

// filterEspessura: não testado — o piloto não usa esse caminho (filtra o pool
// por espessura ANTES de chamar o nest; bench passa filterEspessura: 0).
// Com um único descriptor, peças de outra espessura saem do pool sem virar
// unplaced — comportamento existente, fora do escopo desta correção.
