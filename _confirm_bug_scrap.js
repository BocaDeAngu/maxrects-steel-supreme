// Confirmacao: retalho por DIMENSAO (minDimensaoRetalho) — sem area
const { nest } = require('./src/maxrects');

function caso(titulo, pecas) {
  const r = nest(pecas, 2500, 1250, {
    margin: 10, borda_mm: 10, rotation: true, estrategia: 2, minDimensaoRetalho: 100, repeticoes: 0
  });
  r.sheets.forEach((s, i) => {
    const areaBruta = s.sheetWidth * s.sheetHeight;
    const areaPecas = s.pieces.reduce((a, p) => a + p.width * p.height, 0);
    const areaRealLivre = areaBruta - areaPecas;
    const areaDet = (s.retalhos || []).reduce((a, rr) => a + rr.area, 0);
    console.log(`\n=== ${titulo} — chapa ${i + 1} (util ${s.utilization}%) ===`);
    console.log(`Peças: ${s.pieces.map(p => `(${p.x},${p.y}) ${p.width}x${p.height}`).join(' | ')}`);
    console.log(`Sobra REAL: ${areaRealLivre}mm² (${(areaRealLivre / areaBruta * 100).toFixed(1)}%) | Detectada: ${areaDet}mm² (${(areaDet / areaBruta * 100).toFixed(1)}%)`);
    (s.retalhos || []).forEach(rr => {
      const asp = Math.min(rr.width, rr.height) / Math.max(rr.width, rr.height);
      console.log(`  det: x=${rr.x} y=${rr.y} ${rr.width}x${rr.height} (minDim=${Math.min(rr.width, rr.height)})${asp < 0.1 ? ' ⚠TIRA' : ''}`);
    });
  });
}

// 1 peca 2400x550: sobra real 58% da chapa — bloco 2480x680 deve aparecer
caso('1 peça 2400x550', [{ w: 2400, h: 550, label: 'L2', quantity: 1 }]);
// 2 pecas empilhadas: margem entre peças deve ser PERDA (não retalho)
caso('2 peças 2400x600', [{ w: 2400, h: 600, label: 'L1', quantity: 2 }]);
// bloco de peças no canto: sobra em L
caso('bloco 2x2 no canto', [
  { w: 1100, h: 550, label: 'P1', quantity: 4 },
  { w: 1000, h: 500, label: 'P2', quantity: 1 },
]);
// tira longa e fina: 90x600 deve ser PERDA
caso('tira lateral 90mm', [
  { w: 2400, h: 600, label: 'L1', quantity: 2 },
  { w: 2400, h: 550, label: 'L2', quantity: 1 },
]);
// minDimensaoRetalho=0 → skip
const r0 = nest([{ w: 2400, h: 550, label: 'L2', quantity: 1 }], 2500, 1250, {
  margin: 10, borda_mm: 10, rotation: true, estrategia: 2, minDimensaoRetalho: 0, repeticoes: 0
});
console.log(`\n=== minDimensaoRetalho=0 (skip) === retalhos: ${r0.sheets[0].retalhos === undefined ? 'ausente ✓' : JSON.stringify(r0.sheets[0].retalhos)}`);
