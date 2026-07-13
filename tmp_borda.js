const { nest } = require('./index');

const pecas = [
  { w: 75, h: 85, label: 'P', quantity: 4 },
  { w: 310, h: 310, label: 'G', quantity: 1 },
];

const r = nest(pecas, 500, 500, {
  margin: 10, borda_mm: 10,
  rotation: true, sentido: 'largura', lookAhead: 3, repeticoes: 0
});

console.log(`Chapas: ${r.sheets.length}, Utilização: ${r.stats.avgUtilization}%`);

r.sheets.forEach((s, i) => {
  console.log(`\nChapa ${i+1} (${s.utilization}%)`);
  s.pieces.forEach((p, j) => {
    const margem_info = `borda ${p.x > 5 && p.y > 5 ? '(com borda)' : 'na borda'}`;
    console.log(`  ${j+1}. ${p.label} (${p.width}x${p.height}) em (${p.x}, ${p.y})${p.rotated ? ' rot' : ''} ${p.x >= 10 && p.y >= 10 ? '' : '(encostado na borda)'}`);
  });
});

// Verifica se alguma peça está fora da borda (dentro dos 10mm do limite)
s.pieces.forEach(p => {
  const foraBordaX = p.x < 10 && p.x > 0;
  const foraBordaY = p.y < 10 && p.y > 0;
  if (foraBordaX || foraBordaY) {
    console.log(`  ⚠ ${p.label}: dentro da borda! (x=${p.x}, y=${p.y})`);
  }
});
