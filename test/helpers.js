// Helpers compartilhados dos testes.
const assert = require('assert');

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

module.exports = { assertNoOverlap, pecas };
