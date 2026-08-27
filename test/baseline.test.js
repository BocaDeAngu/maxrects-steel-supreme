// Testes de sanidade do motor — rede de segurança antes das fases de correção de métricas.
const path = require('path');
const assert = require('assert');
const { nest } = require(path.join(__dirname, '..', 'src', 'maxrects'));
const { assertNoOverlap, pecas } = require('./helpers');

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

test('classic-greedy rotation=true rotaciona como fallback (task 0069.3)', () => {
  // Peça 5990x2550 em 2560x6000: só cabe rotacionada (2550x5990).
  // Antes do fix, classic (sem estrategia) + rotation:true nunca gerava
  // candidato rotacionado → unplaced=1 (fit-only funcionava).
  const comRot = nest(pecas([[5990, 2550]]), 2560, 6000, { rotation: true, margin: 0, borda_mm: 0 });
  assert.strictEqual(comRot.unplaced, 0, 'rotation:true deve rotacionar quando só cabe rotacionada');
  const p = comRot.sheets[0].pieces[0];
  assert.strictEqual(p.rotated, true);
  assert.strictEqual(p.width, 2550);
  assert.strictEqual(p.height, 5990);
  // Sem rotação: vai para unplaced
  const semRot = nest(pecas([[5990, 2550]]), 2560, 6000, { rotation: false, margin: 0, borda_mm: 0 });
  assert.strictEqual(semRot.unplaced, 1);
  assert.strictEqual(semRot.sheets.length, 0);
  // Peça que cabe natural continua natural (fallback não sobrepõe Pass 1)
  const natural = nest(pecas([[100, 50]]), 200, 100, { rotation: true, margin: 0 });
  assert.strictEqual(natural.sheets[0].pieces[0].rotated, false);
});

test('margin separa peças vizinhas; peça pode encostar na borda (task 0069)', () => {
  // margin é só entre peças: 100 + 10 + 100 = 210 → chapa 210 acomoda 2 peças
  // coladas nas bordas (faixa de margin da 2ª transborda a borda, permitido).
  const coladas = nest(pecas([[100, 100], [100, 100]]), 210, 120, { margin: 10, rotation: false });
  assert.strictEqual(coladas.sheets.length, 1, 'chapa 210 = 100+10+100 → 1 chapa com 2 peças');
  assert.strictEqual(coladas.sheets[0].pieces.length, 2);
  const ps = coladas.sheets[0].pieces;
  ps.sort((a, b) => a.x - b.x);
  assert.ok(ps[1].x - (ps[0].x + ps[0].width) >= 10 - 1e-6, 'gap entre peças ≥ margin');
  // chapa 209 < 210 → só 1 peça cabe em X (peça real 100 > sobra 99)
  const justa = nest(pecas([[100, 100], [100, 100]]), 209, 120, { margin: 10, rotation: false });
  assert.strictEqual(justa.sheets.length, 2, 'chapa 209 deve exigir 2 chapas (1 peça cada)');
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
