/**
 * Layout validation script.
 *
 * Usage:  node test/validate-layout.mjs
 *
 * Generates SVG files and prints metrics for each strategy × configuration.
 * No dependencies — uses built-in fs.
 */

import { nest } from '../src/maxrects.js';
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.resolve('test/output');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function bbox(placed) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of placed) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x + p.width > maxX) maxX = p.x + p.width;
    if (p.y + p.height > maxY) maxY = p.y + p.height;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, area: (maxX - minX) * (maxY - minY) };
}

function overlaps(placed, margin) {
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i];
    for (let j = i + 1; j < placed.length; j++) {
      const b = placed[j];
      if (a.x < b.x + b.width + margin && a.x + a.width + margin > b.x &&
          a.y < b.y + b.height + margin && a.y + a.height + margin > b.y) {
        return `${a.label}@(${a.x},${a.y}) × ${b.label}@(${b.x},${b.y})`;
      }
    }
  }
  return null;
}

function renderSVG(sheet, sheetW, sheetH, idx) {
  const vw = sheetW, vh = sheetH;
  let svg = `<svg viewBox="0 0 ${vw} ${vh}" xmlns="http://www.w3.org/2000/svg">\n`;
  svg += `  <rect x="0" y="0" width="${vw}" height="${vh}" fill="#f8f9fa" stroke="#333" stroke-width="2"/>\n`;
  // Flip Y
  svg += `  <g transform="translate(0, ${vh}) scale(1, -1)">\n`;
  for (const p of sheet.pieces) {
    const hue = (p.label.charCodeAt(0) * 37) % 360;
    svg += `    <rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}"`;
    svg += ` fill="hsl(${hue}, 60%, 80%)" stroke="hsl(${hue}, 70%, 40%)" stroke-width="1.5"/>\n`;
  }
  svg += `  </g>\n`;
  // Labels
  for (const p of sheet.pieces) {
    const tx = p.x + p.width / 2;
    const ty = vh - p.y - p.height / 2;
    svg += `  <text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central"`;
    svg += ` font-size="12" fill="#000">${p.label}</text>\n`;
  }
  svg += `</svg>\n`;
  return svg;
}

function run(label, pieces, sheetW, sheetH, opts) {
  const result = nest(pieces, sheetW, sheetH, opts);
  const prefix = label.replace(/[^a-zA-Z0-9_-]/g, '_');

  let util = 0;
  let totalBboxArea = 0;
  let totalPlacedArea = 0;
  let overlapCount = 0;
  let totalSheets = 0;

  for (let si = 0; si < result.sheets.length; si++) {
    const s = result.sheets[si];
    const bb = bbox(s.pieces);
    const placedArea = s.pieces.reduce((sum, p) => sum + p.width * p.height, 0);
    const sheetArea = (s.sheetWidth || sheetW) * (s.sheetHeight || sheetH);
    totalBboxArea += bb.area;
    totalPlacedArea += placedArea;
    totalSheets += s.qtd_copias || 1;

    if (si === 0) {
      const svg = renderSVG(s, s.sheetWidth || sheetW, s.sheetHeight || sheetH, si);
      fs.writeFileSync(path.join(OUT_DIR, `${prefix}_sheet${si}.svg`), svg);
    }

    const ov = overlaps(s.pieces, opts.margin || 0);
    if (ov) { overlapCount++; console.error(`  OVERLAP: ${ov}`); }
  }

  const avgBboxUtil = totalBboxArea > 0 ? (totalPlacedArea / totalBboxArea * 100) : 0;
  util = result.stats?.avgUtilization || 0;

  console.log(`  sheets=${result.sheets.length} totalPhys=${totalSheets} unplaced=${result.unplaced}`);
  console.log(`  sheetUtil=${util.toFixed(1)}% bboxUtil=${avgBboxUtil.toFixed(1)}%`);
  console.log(`  bbox: ${result.sheets[0] ? `${bbox(result.sheets[0].pieces).w}×${bbox(result.sheets[0].pieces).h}` : 'N/A'}`);
  console.log(`  overlaps=${overlapCount} peso=${result.stats?.peso_total_kg || '-'} tempo=${result.stats?.tempo_corte_total_min || '-'}`);

  return { result, avgBboxUtil, overlapCount };
}

// ═══════════════════════════════════════════════════════════════
//  Scenarios
// ═══════════════════════════════════════════════════════════════

const SCENARIOS = [
  {
    label: 'Misto G M P X — Greedy (0)',
    pieces: [
      { w: 500, h: 300, label: 'G', quantity: 1 },
      { w: 400, h: 250, label: 'M', quantity: 2 },
      { w: 300, h: 150, label: 'P', quantity: 3 },
      { w: 200, h: 100, label: 'X', quantity: 4 }
    ],
    sheetW: 2000, sheetH: 1000,
    opts: { lookAhead: 0, margin: 5 }
  },
  {
    label: 'Misto G M P X — Beam (5)',
    pieces: [
      { w: 500, h: 300, label: 'G', quantity: 1 },
      { w: 400, h: 250, label: 'M', quantity: 2 },
      { w: 300, h: 150, label: 'P', quantity: 3 },
      { w: 200, h: 100, label: 'X', quantity: 4 }
    ],
    sheetW: 2000, sheetH: 1000,
    opts: { beamWidth: 5, margin: 5 }
  },
  {
    label: 'Grande+Peq — Greedy (0)',
    pieces: [
      { w: 310, h: 310, label: 'G', quantity: 1 },
      { w: 75,  h: 85,  label: 'P', quantity: 4 }
    ],
    sheetW: 600, sheetH: 600,
    opts: { lookAhead: 0, margin: 10 }
  },
  {
    label: 'Grande+Peq — Estrategia 2',
    pieces: [
      { w: 310, h: 310, label: 'G', quantity: 1 },
      { w: 75,  h: 85,  label: 'P', quantity: 4 }
    ],
    sheetW: 600, sheetH: 600,
    opts: { estrategia: 2, margin: 10 }
  },
  {
    label: 'Vertical Misto — Estrategia 0',
    pieces: [
      { w: 500, h: 300, label: 'G', quantity: 1 },
      { w: 400, h: 250, label: 'M', quantity: 2 },
      { w: 300, h: 150, label: 'P', quantity: 3 },
      { w: 200, h: 100, label: 'X', quantity: 4 }
    ],
    sheetW: 2000, sheetH: 1000,
    opts: { estrategia: 0, margin: 5 }
  },
  {
    label: 'Horizontal Misto — Estrategia 1',
    pieces: [
      { w: 500, h: 300, label: 'G', quantity: 1 },
      { w: 400, h: 250, label: 'M', quantity: 2 },
      { w: 300, h: 150, label: 'P', quantity: 3 },
      { w: 200, h: 100, label: 'X', quantity: 4 }
    ],
    sheetW: 2000, sheetH: 1000,
    opts: { estrategia: 1, margin: 5 }
  },
  {
    label: 'Retangulo Misto — Estrategia 2',
    pieces: [
      { w: 500, h: 300, label: 'G', quantity: 1 },
      { w: 400, h: 250, label: 'M', quantity: 2 },
      { w: 300, h: 150, label: 'P', quantity: 3 },
      { w: 200, h: 100, label: 'X', quantity: 4 }
    ],
    sheetW: 2000, sheetH: 1000,
    opts: { estrategia: 2, margin: 5 }
  },
  {
    label: 'Chapa SAC 350 (real) — Estrategia 2',
    pieces: [
      { w: 70, h: 85, label: 'P', quantity: 16 }
    ],
    sheetW: 6000, sheetH: 1210,
    opts: { estrategia: 2, margin: 10 }
  },
  {
    label: 'Chapa SAC 350 (real) — Estrategia 0',
    pieces: [
      { w: 70, h: 85, label: 'P', quantity: 16 }
    ],
    sheetW: 6000, sheetH: 1210,
    opts: { estrategia: 0, margin: 10 }
  }
];

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║       Nesting Layout Validation Suite              ║');
console.log('╚══════════════════════════════════════════════════════╝\n');

let allPassed = true;

for (const sc of SCENARIOS) {
  console.log(`\n[${sc.label}]`);
  const { result, overlapCount } = run(sc.label, sc.pieces, sc.sheetW, sc.sheetH, sc.opts);

  if (overlapCount > 0) {
    console.error(`  ❌ OVERLAP DETECTED`);
    allPassed = false;
  }
  if (result.unplaced > 0) {
    console.log(`  ⚠️  ${result.unplaced} unplaced pieces`);
  }

  const svgPath = `${OUT_DIR}/${sc.label.replace(/[^a-zA-Z0-9_-]/g, '_')}_sheet0.svg`;
  console.log(`  SVG: ${svgPath}`);
}

console.log(`\n${allPassed ? '✅ All scenarios VALID (no overlaps)' : '❌ Some scenarios have issues'}`);
console.log(`SVGs saved to: ${OUT_DIR}\n`);
