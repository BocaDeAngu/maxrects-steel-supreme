/**
 * benchmark.js — Cenários de teste para o algoritmo MaxRects Steel Supreme
 *
 * Uso: node benchmark.js [baseline|deepseek|mimo]
 *   baseline  → executa com código atual
 *   deepseek  → executa com modificações do DeepseekV4Flash
 *   mimo      → executa com modificações do MimoV2.5
 *
 * Saída: JSON com métricas de cada cenário
 */

const { nest } = require('./index');

// ── Cenários ────────────────────────────────────────────────

const scenarios = [
  {
    name: '50x90 sentido largura (muitas)',
    desc: 'Peças 50×90mm em chapa 1200×6000mm — testa fileiras horizontais com muitas peças',
    pieces: [{ w: 50, h: 90, label: 'peca', quantity: 3200 }],
    sheetW: 1200,
    sheetH: 6000,
    opts: {
      margin: 0,
      rotation: true,
      sentido: 'largura',
      lookAhead: 1,
      repeticoes: 1,
      maxSheets: 0
    }
  },
  {
    name: '50x90 sem sentido (muitas)',
    desc: 'Peças 50×90mm — sem direção forçada, muitas peças',
    pieces: [{ w: 50, h: 90, label: 'peca', quantity: 3200 }],
    sheetW: 1200,
    sheetH: 6000,
    opts: {
      margin: 0,
      rotation: true,
      sentido: '',
      lookAhead: 1,
      repeticoes: 1,
      maxSheets: 0
    }
  },
  {
    name: '50x90 sentido comprimento (muitas)',
    desc: 'Peças 50×90mm — sentido comprimento, muitas peças',
    pieces: [{ w: 50, h: 90, label: 'peca', quantity: 3200 }],
    sheetW: 1200,
    sheetH: 6000,
    opts: {
      margin: 0,
      rotation: true,
      sentido: 'comprimento',
      lookAhead: 1,
      repeticoes: 1,
      maxSheets: 0
    }
  },
  {
    name: 'mistas sentido largura',
    desc: 'Peças variadas, sentido largura',
    pieces: [
      { w: 300, h: 200, label: 'gde', quantity: 20 },
      { w: 150, h: 100, label: 'med', quantity: 60 },
      { w: 80,  h: 60,  label: 'peq', quantity: 100 },
      { w: 50,  h: 90,  label: 'esteira', quantity: 80 },
    ],
    sheetW: 1200,
    sheetH: 3000,
    opts: {
      margin: 5,
      rotation: true,
      sentido: 'largura',
      lookAhead: 1,
      repeticoes: 1
    }
  },
  {
    name: 'mistas sem sentido',
    desc: 'Peças variadas, sem direção forçada',
    pieces: [
      { w: 300, h: 200, label: 'gde', quantity: 20 },
      { w: 150, h: 100, label: 'med', quantity: 60 },
      { w: 80,  h: 60,  label: 'peq', quantity: 100 },
      { w: 50,  h: 90,  label: 'esteira', quantity: 80 },
    ],
    sheetW: 1200,
    sheetH: 3000,
    opts: {
      margin: 5,
      rotation: true,
      sentido: '',
      lookAhead: 1,
      repeticoes: 1
    }
  },
  {
    name: 'poucas pecas grandes',
    desc: 'Poucas peças grandes em chapa grande',
    pieces: [
      { w: 800, h: 600, label: 'A', quantity: 8 },
      { w: 500, h: 400, label: 'B', quantity: 12 },
    ],
    sheetW: 2000,
    sheetH: 1000,
    opts: {
      margin: 10,
      rotation: true,
      sentido: '',
      lookAhead: 2,
      repeticoes: 0
    }
  },
  {
    name: 'barras 30x100 sentido largura (muitas)',
    desc: 'Muitas barras 30×100mm — testa fileiras com alta densidade',
    pieces: [{ w: 30, h: 100, label: 'barra', quantity: 3000 }],
    sheetW: 1200,
    sheetH: 3000,
    opts: {
      margin: 2,
      rotation: true,
      sentido: 'largura',
      lookAhead: 2,
      repeticoes: 0,
      maxSheets: 5
    }
  },
];

// ── Runner ──────────────────────────────────────────────────

function runScenario(s) {
  const start = Date.now();
  let result;
  try {
    result = nest(s.pieces, s.sheetW, s.sheetH, s.opts);
  } catch (e) {
    return {
      scenario: s.name,
      error: e.message,
      timeMs: Date.now() - start
    };
  }
  const timeMs = Date.now() - start;

  return {
    scenario: s.name,
    sheets: result.sheets.length,
    totalPieces: result.stats.totalPieces,
    totalArea: result.stats.totalArea,
    avgUtilization: result.stats.avgUtilization,
    unplaced: result.unplaced,
    timeMs,
    sheetsDetail: result.sheets.map((sh, i) => ({
      sheet: i + 1,
      pieces: sh.pieces.length,
      usedArea: sh.usedArea,
      utilization: sh.utilization,
      vezesCortada: sh.vezes_cortada
    }))
  };
}

// ── Main ────────────────────────────────────────────────────

const label = process.argv[2] || 'baseline';
console.log(`\n╔══════════════════════════════════════════╗`);
console.log(`║  BENCHMARK: ${label.padEnd(30)}║`);
console.log(`╚══════════════════════════════════════════╝\n`);

const results = [];
for (const s of scenarios) {
  console.log(`▶ ${s.name}: ${s.desc}`);
  const r = runScenario(s);
  results.push(r);
  if (r.error) {
    console.log(`  ✗ ERRO: ${r.error}\n`);
  } else {
    console.log(`  ✓ ${r.sheets} chapa(s) | ${r.totalPieces} peças | ${r.avgUtilization}% utilização | ${r.unplaced} não-alocadas | ${r.timeMs}ms`);
    for (const sd of r.sheetsDetail) {
      console.log(`    Chapa ${sd.sheet}: ${sd.pieces} peças, ${sd.utilization}%${sd.vezesCortada > 1 ? ` (×${sd.vezesCortada})` : ''}`);
    }
    console.log('');
  }
}

// Save results
const fs = require('fs');
const outPath = `benchmark-${label}.json`;
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`Resultados salvos em ${outPath}`);
