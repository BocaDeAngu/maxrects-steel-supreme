// Estratégia 3 (Guilhotina): shelf NFDH + h* — cortável por construção.
const path = require('path');
const assert = require('assert');
const { nest } = require(path.join(__dirname, '..', 'src', 'maxrects'));
const { assertNoOverlap } = require('./helpers');

// ── Validador de cortabilidade (o requisito) ────────────────
// Reconstrói a árvore de cortes: recursivamente, existe um corte reto
// (vertical em X ou horizontal em Y) que separa o grupo em 2 sem
// atravessar peça alguma? Se algum caminho reduz tudo a grupos de 1 →
// guilhotinável. A árvore em si não interessa (ordem de corte não importa).
function assertGuillotine(pieces, sheetW, sheetH, msg = '') {
  const rects = pieces.map(p => ({ x: p.x, y: p.y, w: p.width, h: p.height }));
  const memo = new Map();

  const canCut = (list, rx, ry, rw, rh) => {
    if (list.length <= 1) return true;
    const key = JSON.stringify([rx, ry, rw, rh, list.map(r => [r.x, r.y, r.w, r.h]).sort()]);
    if (memo.has(key)) return memo.get(key);

    let ok = false;
    // Cortes verticais (X)
    for (const r of list) {
      const cutX = r.x + r.w;
      if (cutX <= rx + 1e-9 || cutX >= rx + rw - 1e-9) continue;
      const left = list.filter(q => q.x + q.w <= cutX + 1e-9);
      const right = list.filter(q => q.x >= cutX - 1e-9);
      if (left.length > 0 && right.length > 0 && left.length + right.length === list.length) {
        if (canCut(left, rx, ry, cutX - rx, rh) && canCut(right, cutX, ry, rx + rw - cutX, rh)) { ok = true; break; }
      }
    }
    // Cortes horizontais (Y)
    if (!ok) {
      for (const r of list) {
        const cutY = r.y + r.h;
        if (cutY <= ry + 1e-9 || cutY >= ry + rh - 1e-9) continue;
        const bottom = list.filter(q => q.y + q.h <= cutY + 1e-9);
        const top = list.filter(q => q.y >= cutY - 1e-9);
        if (bottom.length > 0 && top.length > 0 && bottom.length + top.length === list.length) {
          if (canCut(bottom, rx, ry, rw, cutY - ry) && canCut(top, rx, cutY, rw, ry + rh - cutY)) { ok = true; break; }
        }
      }
    }
    memo.set(key, ok);
    return ok;
  };

  assert.ok(canCut(rects, 0, 0, sheetW, sheetH), `${msg} layout não é guilhotinável`);
}

// Pool real da folha 34 do proj 37 (esp2.25, chapa 3000×1210, margem 2)
function poolFolha34() {
  const pecas = [];
  for (let i = 0; i < 7; i++) pecas.push({ w: 292, h: 402, label: `292x402-${i}` });
  for (let i = 0; i < 12; i++) pecas.push({ w: 318, h: 292, label: `318x292-${i}` });
  for (let i = 0; i < 3; i++) pecas.push({ w: 250, h: 292, label: `250x292-${i}` });
  return pecas;
}

test('guilhotina: h* 292 no Y + cortável (folha 34 real)', () => {
  const r = nest(poolFolha34(), 3000, 1210, { margin: 2, estrategia: 3 });
  assert.strictEqual(r.unplaced, 0, `unplaced=${r.unplaced}`);
  const placed = r.sheets.flatMap(s => s.pieces);
  for (const p of placed) {
    if (p.width === 402 || p.height === 402) {
      assert.strictEqual(p.height, 292, `peça 402 com 402 no Y (${p.width}x${p.height})`);
    }
  }
  for (const s of r.sheets) {
    assertNoOverlap(s.pieces, s.sheetWidth, s.sheetHeight, 'g-folha34');
    assertGuillotine(s.pieces, s.sheetWidth, s.sheetHeight, 'g-folha34');
  }
  // 3 fileiras de 294 = 882 ≤ 1206 (Y livre contíguo, como o maxrects+h*)
  const yMax = Math.max(...placed.map(p => p.y + p.height));
  assert.ok(yMax <= 884, `yMax ${yMax} — fileiras não alinhadas`);
});

test('guilhotina: pool heterogêneo (sem h*) — orientação livre, cortável, sem crash', () => {
  const pecas = [];
  for (let i = 0; i < 5; i++) pecas.push({ w: 500, h: 292, label: `a${i}` });
  for (let i = 0; i < 5; i++) pecas.push({ w: 300, h: 400, label: `b${i}` });
  for (let i = 0; i < 3; i++) pecas.push({ w: 200, h: 300, label: `c${i}` });
  const r = nest(pecas, 3000, 1210, { margin: 2, estrategia: 3 });
  assert.strictEqual(r.unplaced, 0, `unplaced=${r.unplaced}`);
  for (const s of r.sheets) {
    assertNoOverlap(s.pieces, s.sheetWidth, s.sheetHeight, 'g-hetero');
    assertGuillotine(s.pieces, s.sheetWidth, s.sheetHeight, 'g-hetero');
  }
});

test('guilhotina: peça que SÓ cabe rotacionada é girada (200×1500 → 1500×200)', () => {
  const pecas = poolFolha34();
  pecas.push({ w: 200, h: 1500, label: '200x1500' });
  const r = nest(pecas, 3000, 1210, { margin: 2, estrategia: 3 });
  assert.strictEqual(r.unplaced, 0, `unplaced=${r.unplaced}`);
  const g = r.sheets.flatMap(s => s.pieces).find(p => p.label === '200x1500');
  assert.ok(g, 'peça 200x1500 não colocada');
  assert.strictEqual(g.rotated, true, '200x1500 deveria ter sido rotacionada');
  assert.strictEqual(g.width, 1500);
  assert.strictEqual(g.height, 200);
  for (const s of r.sheets) {
    assertNoOverlap(s.pieces, s.sheetWidth, s.sheetHeight, 'g-rot');
    assertGuillotine(s.pieces, s.sheetWidth, s.sheetHeight, 'g-rot');
  }
});

test('guilhotina: rotation off — sem rotação, sem crash, cortável', () => {
  const pecas = [];
  for (let i = 0; i < 5; i++) pecas.push({ w: 500, h: 292, label: `a${i}` });
  for (let i = 0; i < 5; i++) pecas.push({ w: 300, h: 400, label: `b${i}` });
  const r = nest(pecas, 3000, 1210, { margin: 2, estrategia: 3, rotation: false });
  assert.strictEqual(r.unplaced, 0, `unplaced=${r.unplaced}`);
  for (const s of r.sheets) {
    assertNoOverlap(s.pieces, s.sheetWidth, s.sheetHeight, 'g-norot');
    assertGuillotine(s.pieces, s.sheetWidth, s.sheetHeight, 'g-norot');
  }
});

test('guilhotina: multi-sheet respeita maxSheets', () => {
  const pecas = [];
  for (let k = 0; k < 4; k++) pecas.push(...poolFolha34());
  const r = nest(pecas, 3000, 1210, { margin: 2, estrategia: 3, maxSheets: 2 });
  assert.strictEqual(r.sheets.length, 2, `sheets=${r.sheets.length}`);
  // pool ×4: 28 peças 402-lane na 1ª folha (7/fileira × 4 fileiras) + 36 na 2ª (9/fileira × 4)
  assert.strictEqual(r.unplaced, 24, `unplaced=${r.unplaced} (64 colocadas, 88 total)`);
  for (const s of r.sheets) {
    assertNoOverlap(s.pieces, s.sheetWidth, s.sheetHeight, 'g-multi');
    assertGuillotine(s.pieces, s.sheetWidth, s.sheetHeight, 'g-multi');
  }
});

test('guilhotina: densidade ≥ 90% do maxrects+h* no mesmo pool (custo da restrição é pequeno)', () => {
  const pecas = [];
  for (let k = 0; k < 4; k++) pecas.push(...poolFolha34());
  const mr = nest(pecas, 3000, 1210, { margin: 2, estrategia: 2, zonaPct: 1 });
  const gui = nest(pecas, 3000, 1210, { margin: 2, estrategia: 3 });
  assert.strictEqual(mr.unplaced, 0, `maxrects unplaced=${mr.unplaced}`);
  assert.strictEqual(gui.unplaced, 0, `guilhotina unplaced=${gui.unplaced}`);
  const mrUtil = mr.stats.avgUtilization;
  const guiUtil = gui.stats.avgUtilization;
  assert.ok(guiUtil >= mrUtil * 0.9,
    `guilhotina ${guiUtil}% < 90% do maxrects+h* ${mrUtil}%`);
});

test('guilhotina: borda_mm desloca peças sem quebrar cortabilidade', () => {
  const r = nest(poolFolha34(), 3000, 1210, { margin: 2, borda_mm: 2, estrategia: 3 });
  assert.strictEqual(r.unplaced, 0, `unplaced=${r.unplaced}`);
  for (const s of r.sheets) {
    assertNoOverlap(s.pieces, s.sheetWidth, s.sheetHeight, 'g-borda');
    // Peças já com offset de borda — a cortabilidade vale na área efetiva
    assertGuillotine(s.pieces.map(p => ({ ...p, x: p.x - 2, y: p.y - 2 })),
      s.sheetWidth - 4, s.sheetHeight - 4, 'g-borda');
  }
});
