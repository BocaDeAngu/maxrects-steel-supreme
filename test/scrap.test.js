// _calcScrap — perda/sobra: retalhos disjuntos, soma não pode exceder a área livre.
// Caso folha 52 do proj 37: 2 peças 3000x370 empilhadas em chapa 6000x1510.
const path = require('path');
const assert = require('assert');
const { nest } = require(path.join(__dirname, '..', 'src', 'maxrects'));
const { assertNoOverlap } = require('./helpers');

function pecasDe(lista) {
  return lista.map(([w, h, label]) => ({ w, h, label: label || `${w}x${h}`, material: 'CIVIL 300', espessura_mm: 3.75, origem_id: 1 }));
}

test('folha 52: 2 peças empilhadas → faixa direita + faixa inferior, ambas sobra (sem sobreposição)', () => {
  const r = nest(pecasDe([[3000, 370, 'a'], [3000, 370, 'b']]), 6000, 1510, {
    margin: 2, borda_mm: 2, estrategia: 2, zonaPct: 1, minDimensaoRetalho: 100, maxSheets: 1
  });
  const sheet = r.sheets[0];
  assert.strictEqual(sheet.pieces.length, 2, `peças=${sheet.pieces.length}`);
  const areaTot = 5996 * 1506; // effW × effH
  const ret = sheet.retalhos || [];
  assert.ok(ret.length >= 2, `esperava 2 retalhos (direita + inferior), veio ${ret.length}`);
  const soma = ret.reduce((s, x) => s + x.area, 0);
  const areaLivre = areaTot - sheet.pieces.reduce((s, p) => s + p.width * p.height, 0);
  // Antes do fix: só a faixa inferior (50.7% — 4.58m²). Agora ≥74% (6.68m²)
  assert.ok(soma > areaLivre * 0.97, `soma retalhos ${(soma / 1e6).toFixed(2)}m² deve cobrir ~toda a área livre ${(areaLivre / 1e6).toFixed(2)}m²`);
  assert.ok(soma <= areaLivre + 1, `soma retalhos ${(soma / 1e6).toFixed(2)}m² excede a área livre ${(areaLivre / 1e6).toFixed(2)}m²`);
  // sem sobreposição entre retalhos
  for (let i = 0; i < ret.length; i++) {
    for (let j = i + 1; j < ret.length; j++) {
      const a = ret[i], b = ret[j];
      const sobrepoe = a.x < b.x + b.width && a.x + a.width > b.x &&
                       a.y < b.y + b.height && a.y + a.height > b.y;
      assert.ok(!sobrepoe, `retalhos ${i} e ${j} sobrepostos`);
    }
  }
});

test('folha com 4 peças empilhadas: 1 retalho contíguo à direita (sem regressão)', () => {
  const r = nest(pecasDe([[3000, 370, 'a'], [3000, 370, 'b'], [3000, 370, 'c'], [3000, 370, 'd']]), 6000, 1510, {
    margin: 2, borda_mm: 2, estrategia: 2, zonaPct: 1, minDimensaoRetalho: 100, maxSheets: 1
  });
  const sheet = r.sheets[0];
  assert.strictEqual(sheet.pieces.length, 4);
  const ret = sheet.retalhos || [];
  assert.strictEqual(ret.length, 1, `esperava 1 retalho, veio ${ret.length}`);
  // faixa direita ~2994×1490 (sem a tira final de 16mm, que é perda real)
  assert.ok(ret[0].width > 2900 && ret[0].height > 1400, `retalho ${ret[0].width}x${ret[0].height} inesperado`);
});

test('peças com margem: retalhos com dimensão < 100 viram perda (não entram na soma)', () => {
  // peças grandes lado a lado → vão estreitos < 100mm no meio não são retalho
  const r = nest(pecasDe([[2900, 500, 'a'], [2900, 500, 'b']]), 6000, 600, {
    margin: 2, borda_mm: 2, estrategia: 2, zonaPct: 1, minDimensaoRetalho: 100, maxSheets: 1
  });
  const sheet = r.sheets[0];
  const ret = sheet.retalhos || [];
  for (const x of ret) {
    assert.ok(x.width >= 100 && x.height >= 100, `retalho ${x.width}x${x.height} < 100mm entrou como sobra`);
  }
});
