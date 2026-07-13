/**
 * MaxRects Bin Packing — with 3-region split, BRS heuristic, look-ahead,
 * and configurable strategy (estrategia) that tunes sort, scoring tiers,
 * split bias, and placement direction for 4 distinct packing patterns.
 *
 * Algorithm:
 *  1. Maintain a list of free rectangles (freeRects).
 *  2. For each piece, evaluate every (freeRect × orientation) candidate.
 *  3. Score each candidate via BRS (Best Remaining Space):
 *       - Simulate split and measure the largest resulting free rect.
 *       - Bonus: check whether look-ahead pieces fit afterward.
 *  4. Place the piece at the highest-scoring position and split the rect.
 *  5. Merge adjacent free rects to reduce fragmentation.
 *  6. Prune any rect fully contained within another.
 *
 * Reference: https://github.com/juj/RectangleBinPack (original MaxRects)
 */

// ═══════════════════════════════════════════════════════════
//  Strategy configuration
// ═══════════════════════════════════════════════════════════

/**
 * Maps estrategia (0|1|2|3) to a full algorithm configuration:
 *   direcao, sort order, lookAhead, split bias, and per-tier weights.
 *
 * Each tier has a `weight` multiplier and optional `mode` string.
 *
 * Tiers (applied in _scoreCandidate):
 *   Tier 1 — look-ahead future-fit count
 *   Tier 2 — spatial scoring (BRS classic, SRS directional, or none)
 *   Tier 3 — alignment bonus (how well piece fills the dimension)
 *   Tier 4 — waste penalty (large free rect eaten by small piece)
 *   Tier 5 — squareness bonus (prefer splits leaving near-square rects)
 *   Tiebreaker — direcao-based position preference
 *
 * @param {number} estrategia — 0=horizontal, 1=vertical, 2=zigzag, 3=1x1
 * @returns {object} config
 */
const DEFAULT_TIERS = {
  tier1: {},
  tier2: { weight: 1.0, mode: 'brs' },
  tier3: { weight: 0 },
  tier4: { weight: 0.05 },
  tier5: { weight: 0.02 },
  tiebreaker: { weight: 0 }
};

function _estrategiaConfig(estrategia) {
  const e = [0, 1, 2, 3].includes(estrategia) ? estrategia : 0;

  switch (e) {
    case 0: // largura — coluna vertical (CNC: largura.CNC)
      // direcao='vertical' → tier2 prefere Y maior (pra baixo) + hFirst → colunas
      // sort por width DESC → peças mais largas primeiro, definem largura da coluna
      // Greedy (lookAhead=0): cada peça vai pro espaço mais abaixo disponível
      return {
        label: 'Vertical',
        direcao: 'vertical',
        sortComparator:
          (a, b) => b.w - a.w || (b.w * b.h) - (a.w * a.h),
        lookAhead: 0,
        splitBias: 100,
        tiers: {
          tier2: { weight: 10.0, mode: 'direcao' },
          tier3: { weight: 0.5, mode: 'direcao' },
          tier4: { weight: 0.05 },
          tier5: { weight: 0.02 },
          tiebreaker: { weight: 0.01, mode: 'direcao' }
        }
      };

    case 1: // comprimento — fileira horizontal (CNC: comprimento.CNC)
      // direcao='horizontal' → tier2 prefere X maior (pra direita) + vFirst → fileiras
      // sort por height DESC → peças mais altas primeiro, definem altura da fileira
      // Greedy (lookAhead=0): cada peça vai pro espaço mais à direita disponível
      return {
        label: 'Horizontal',
        direcao: 'horizontal',
        sortComparator:
          (a, b) => b.h - a.h || (b.w * b.h) - (a.w * a.h),
        lookAhead: 0,
        splitBias: 100,
        tiers: {
          tier2: { weight: 10.0, mode: 'direcao' },
          tier3: { weight: 0.5, mode: 'direcao' },
          tier4: { weight: 0.05 },
          tier5: { weight: 0.02 },
          tiebreaker: { weight: 0.01, mode: 'direcao' }
        }
      };

    case 2: // zigzag — alternância direita/baixo (CNC: ZigZig.CNC)
      // Alterna direcao a cada peça colocada:
      //   dir=1 (comprimento) → vFirst → expande pra DIREITA (fileira)
      //   dir=-1 (largura)    → hFirst → expande pra BAIXO (coluna)
      // Cria padrão serrilhado: →↓→↓→↓
      return {
        label: 'ZigZag',
        direcao: 'horizontal',
        sortComparator:
          (a, b) => (b.w * b.h) - (a.w * a.h) || b.h - a.h,
        lookAhead: 0,
        splitBias: 100,
        zigzag: true,
        tiers: {
          tier2: { weight: 10.0, mode: 'zigzag' },
          tier3: { weight: 0.2, mode: 'direcao' },
          tier4: { weight: 0.05 },
          tier5: { weight: 0.10 },   // squareness ajuda agrupar
          tiebreaker: { weight: 0 }
        }
      };

    case 3: // 1×1 — bloco denso e compacto (CNC: 1x1.CNC)
      // Modo 'square': maximiza quadratura do bounding box de todas
      // as peças. Sort descendente (G 1º, pequenas depois) — cada
      // peça menor decide direção contra o bbox já distribuído.
      return {
        label: '1×1',
        direcao: '',
        sortComparator: (a, b) => (b.w * b.h) - (a.w * a.h),
        lookAhead: 0,
        splitBias: 0,
        zigzag: false,
        tiers: {
          tier2: { weight: 10.0, mode: 'square' },
          tier3: { weight: 0 },
          tier4: { weight: 0.50 },
          tier5: { weight: 2.0 },
          tiebreaker: { weight: 0 }
        }
      };
  }
}

// ────────────────────────────────────────────────────────────
//  MaxRectsBin
// ────────────────────────────────────────────────────────────

class MaxRectsBin {
  /**
   * @param {number} width  - Sheet width in mm
   * @param {number} height - Sheet height in mm
   * @param {object} [opts] - Configuration object
   * @param {number} [opts.margin=0]     - Gap between pieces
   * @param {string} [opts.direcao='']   - 'vertical'|'horizontal'|''
   * @param {number} [opts.estrategia=0]  - 0|1|2|3 — packed into this config
   */
  constructor(width, height, opts = {}) {
    this.binW = width;
    this.binH = height;
    this.margin = opts.margin || 0;
    this.direcao = opts.direcao || '';
    this.freeRects = [{ x: 0, y: 0, w: width, h: height }];
    this.placed = [];

    // estrategia -1 = backward compat (classic direcao mode, no overrides)
    const est = [0, 1, 2, 3].includes(opts.estrategia) ? opts.estrategia : -1;
    this.estrategia = est;
    if (est >= 0) {
      const cfg = _estrategiaConfig(est);
      this._strategy = cfg;
      this.direcao = cfg.direcao; // strategy direcao overrides passed direcao
    } else {
      this._strategy = null;
    }

    // zigzag alternation direction: 1 = right/down, -1 = left/up
    this._zigzagDir = 1;
    this._lastPx = -1;
    this._lastPy = -1;
    this._bboxMinX = Infinity;
    this._bboxMinY = Infinity;
    this._bboxMaxX = -Infinity;
    this._bboxMaxY = -Infinity;
    this._alignAxis = null;   // 'x' (horizontal row) or 'y' (vertical column)
    this._alignW = 0;         // piece width  that triggered alignment
    this._alignH = 0;         // piece height that triggered alignment
    this._alignAnchorPos = -1; // py (alignAxis='x') ou px (alignAxis='y')
  }

  /**
   * Place a single piece (w × h) into the bin.
   *
   * @param {number} w - Piece width
   * @param {number} h - Piece height
   * @param {object} [opts]
   * @param {number} [opts.lookAhead]   - Override strategy lookAhead (optional)
   * @param {Array}  [opts.remaining=[]] - Remaining pieces for look-ahead
   * @param {boolean} [opts.rotation=true] - Allow 90° rotation
   * @returns {object|null} Placed rect { x, y, width, height, rotated } or null
   */
  insert(w, h, opts = {}) {
    // lookAhead from strategy config unless explicitly overridden
    const lookAhead = opts.lookAhead != null ? opts.lookAhead : (this._strategy?.lookAhead ?? 1);
    const { remaining = [], rotation = true } = opts;
    const mw = w + this.margin;
    const mh = h + this.margin;

    // ── Enumerate all candidate placements ──────────────────
    const candidates = [];

    for (let i = 0; i < this.freeRects.length; i++) {
      const fr = this.freeRects[i];

      // Orientation A: as-is
      if (mw <= fr.w && mh <= fr.h) {
        candidates.push({
          frIdx: i, px: fr.x, py: fr.y,
          pw: mw, ph: mh,
          rotated: false
        });
      }

      // Orientation B: rotated 90°
      if (rotation && mh <= fr.w && mw <= fr.h) {
        candidates.push({
          frIdx: i, px: fr.x, py: fr.y,
          pw: mh, ph: mw,
          rotated: true
        });
      }
    }

    if (candidates.length === 0) return null;

    // ── Score each candidate ────────────────────────────────
    let best = null;
    let bestScore = -Infinity;

    for (const cand of candidates) {
      const score = this._scoreCandidate(cand, { lookAhead, remaining, rotation });
      if (score > bestScore) {
        bestScore = score;
        best = cand;
      }
    }

    // ── Place the piece ─────────────────────────────────────
    // IMPORTANTE: quando rotacionado, o espaço ocupado tem dimensões TROCADAS
    // (largura = altura original, altura = largura original).
    // O split (pw/ph) já usa as dimensões da orientação escolhida,
    // então o placedRect precisa refletir o espaço REALMENTE ocupado
    // para que os free rects não sobreponham a peça.
    const placedRect = {
      x: best.px, y: best.py,
      width: best.rotated ? h : w,
      height: best.rotated ? w : h,
      rotated: best.rotated
    };
    this.placed.push(placedRect);
    this._splitRect(best.frIdx, best.px, best.py, best.pw, best.ph);

    this._lastPx = best.px;
    this._lastPy = best.py;
    if (best.px < this._bboxMinX) this._bboxMinX = best.px;
    if (best.py < this._bboxMinY) this._bboxMinY = best.py;
    const br = best.px + best.pw;
    const bb = best.py + best.ph;
    if (br > this._bboxMaxX) this._bboxMaxX = br;
    if (bb > this._bboxMaxY) this._bboxMaxY = bb;

    // Square mode: ancora posição da 1ª peça do lote
    if (this._alignAxis && this._alignAnchorPos < 0) {
      this._alignAnchorPos = (this._alignAxis === 'x') ? best.py : best.px;
    }

    // ZigZag: alterna direção da pontuação (→↔↓) a cada peça
    if (this._strategy?.zigzag) {
      this._zigzagDir *= -1;
    }

    return placedRect;
  }

  // ──────────────────────────────────────────────────────────
  //  Scoring: BRS + Look-ahead (multi-tier, strategy-configurable)
  // ──────────────────────────────────────────────────────────

  /**
   * Score one candidate placement using tiered BRS + look-ahead.
   *
   * Each tier's weight is read from `this._strategy.tiers`, allowing
   * each estrategia to tune the scoring independently.
   *
   * Tier 1 — look-ahead future-fit count (dominant: binArea × 2 per piece).
   * Tier 2 — spatial score: BRS (largest remaining rect) or direcao-directional.
   * Tier 3 — alignment bonus (piece fills the target dimension).
   * Tier 4 — waste penalty (large free rect consumed by small piece).
   * Tier 5 — squareness bonus (prefer splits leaving near-square rects).
   * Tiebreaker — direcao position preference (tiny weight, only breaks ties).
   */
  _scoreCandidate(cand, { lookAhead, remaining, rotation }) {
    const fr = this.freeRects[cand.frIdx];
    const vSplits = this._genSplitV(fr, cand.px, cand.py, cand.pw, cand.ph);
    const hSplits = this._genSplitH(fr, cand.px, cand.py, cand.pw, cand.ph);

    // Pick the better split (com bias suave de 5x para direcao)
    let maxV = vSplits.reduce((m, r) => Math.max(m, r.w * r.h), 0);
    let maxH = hSplits.reduce((m, r) => Math.max(m, r.w * r.h), 0);

    if (this._strategy?.zigzag) {
      if (this._zigzagDir > 0) maxH *= 5;   // → phase: vFirst chosen
      else maxV *= 5;                        // ↓ phase: hFirst chosen
    } else if (this.direcao === 'vertical') {
      maxV *= 5;
    } else if (this.direcao === 'horizontal') {
      maxH *= 5;
    }

    const splits = maxV <= maxH ? vSplits : hSplits;
    const binArea = this.binW * this.binH;
    const T = this._strategy?.tiers || DEFAULT_TIERS;

    // ── Tier 1: look-ahead (always active, high weight) ──
    let futureFitCount = 0;
    if (lookAhead > 0 && remaining.length > 0 && splits.length > 0) {
      const depth = Math.min(lookAhead, remaining.length);
      for (const sr of splits) {
        let fitsInRect = 0;
        for (let d = 0; d < depth; d++) {
          const p = remaining[d];
          const pmw = p.w + this.margin;
          const pmh = p.h + this.margin;
          if ((pmw <= sr.w && pmh <= sr.h) ||
              (rotation && pmh <= sr.w && pmw <= sr.h)) {
            fitsInRect++;
          }
        }
        futureFitCount += fitsInRect;
      }
    }
    const tier1 = futureFitCount * binArea * 2;

    // ── Tier 2: spatial score ───────────────────────────
    let tier2 = 0;
    if (splits.length > 0) {
      const t2 = T.tier2;
      if (t2?.mode === 'direcao' && this.direcao === 'vertical') {
        tier2 = cand.py * binArea / this.binH;
      } else if (t2?.mode === 'direcao' && this.direcao === 'horizontal') {
        tier2 = cand.px * binArea / this.binW;
      } else if (t2?.mode === 'zigzag') {
        // ZigZag: alterna entre expandir p/ direita (→) e p/ baixo (↓)
        // com penalidade de proximidade p/ evitar saltos desconectados
        const prox = this._strategy?.proximityWeight ?? 1.2;
        if (this._zigzagDir > 0) {
          tier2 = cand.px * binArea / this.binW;   // → phase: prefer X (right)
          if (this._lastPx >= 0) {
            tier2 -= Math.abs(cand.py - this._lastPy) * binArea / this.binH * prox;
          }
        } else {
          tier2 = cand.py * binArea / this.binH;   // ↓ phase: prefer Y (down)
          if (this._lastPx >= 0) {
            tier2 -= Math.abs(cand.px - this._lastPx) * binArea / this.binW * prox;
          }
        }
      } else if (t2?.mode === 'square') {
        // ── Heurística de direção do bloco ─────────────────
        // Antes da 1ª peça pequena, decide direção comparando
        // o bloco total (count * peça) contra a maior dimensão
        // já distribuída (anchor). Escolhe a direção cuja soma
        // mais se aproxima da dimensão do anchor.
        if (this._alignAxis === null && this._lastPx >= 0 && remaining.length > 0) {
          const count = remaining.length + 1;  // +1 p/ peça atual
          const repW = remaining[0].w;
          const repH = remaining[0].h;
          const totalRow = count * repW;   // largura se fileira
          const totalCol = count * repH;   // altura se coluna
          const anchorDim = Math.max(
            this._bboxMaxX - this._bboxMinX,
            this._bboxMaxY - this._bboxMinY
          );
          this._alignAxis = Math.abs(totalRow - anchorDim) <= Math.abs(totalCol - anchorDim)
            ? 'x' : 'y';
          this._alignW = repW;
          this._alignH = repH;
        }

        // Squareness do bounding box após colocar esta peça.
        const newMinX = Math.min(this._bboxMinX, cand.px);
        const newMinY = Math.min(this._bboxMinY, cand.py);
        const newMaxX = Math.max(this._bboxMaxX, cand.px + cand.pw);
        const newMaxY = Math.max(this._bboxMaxY, cand.py + cand.ph);
        const bw = Math.max(1, newMaxX - newMinX);
        const bh = Math.max(1, newMaxY - newMinY);
        tier2 = (Math.min(bw, bh) / Math.max(bw, bh)) * binArea;

        // Bônus de alinhamento: se a peça tem mesma dimensão do
        // bloco, prefere continuar na mesma fileira (alignAxis='x')
        // ou coluna (alignAxis='y').
        if (this._alignAxis && this._lastPx >= 0) {
          const candW = cand.rotated ? cand.ph - this.margin : cand.pw - this.margin;
          const candH = cand.rotated ? cand.pw - this.margin : cand.ph - this.margin;
          if (candW === this._alignW && candH === this._alignH) {
            // Posição esperada do lote:
            //   'x' = abaixo do anchor (py ≈ bboxMaxY)
            //   'y' = à direita do anchor (px ≈ bboxMaxX)
            // Na 1ª peça, usa o bbox; nas seguintes, usa _alignAnchorPos
            if (this._alignAxis === 'x') {
              const expectedY = this._alignAnchorPos >= 0
                ? this._alignAnchorPos
                : this._bboxMaxY;
              if (Math.abs(cand.py - expectedY) <= this.margin) {
                tier2 += binArea * 0.5;
              }
            } else {
              const expectedX = this._alignAnchorPos >= 0
                ? this._alignAnchorPos
                : this._bboxMaxX;
              if (Math.abs(cand.px - expectedX) <= this.margin) {
                tier2 += binArea * 0.5;
              }
            }
          }
        }
      } else {
        // BRS clássico
        tier2 = splits.reduce((max, r) => Math.max(max, r.w * r.h), 0);
      }
      tier2 *= (t2?.weight ?? 1.0);
    }

    // ── Tier 3: alignment bonus ─────────────────────────
    let tier3 = 0;
    const t3 = T.tier3;
    if (t3?.mode === 'direcao' && t3.weight > 0) {
      const dir = this._strategy?.zigzag
        ? (this._zigzagDir > 0 ? 'horizontal' : 'vertical')
        : this.direcao;
      if (dir === 'vertical') {
        tier3 = (cand.pw / fr.w) * binArea * t3.weight;
      } else if (dir === 'horizontal') {
        tier3 = (cand.ph / fr.h) * binArea * t3.weight;
      }
    }

    // ── Tier 4: waste penalty ───────────────────────────
    // Penaliza colocação que deixa retângulo livre muito maior que a peça
    // (anti-spread: log10 da razão entre maior leftover e 10× área da peça)
    let tier4 = 0;
    const t4 = T.tier4;
    if (t4?.weight && splits.length > 0) {
      const maxResultArea = splits.reduce((max, r) => Math.max(max, r.w * r.h), 0);
      const candArea = cand.pw * cand.ph;
      const ratio = maxResultArea / Math.max(1, candArea * 10);
      tier4 = -Math.log10(Math.max(1, ratio)) * binArea * t4.weight;
    }

    // ── Tier 5: squareness bonus ────────────────────────
    let tier5 = 0;
    const t5 = T.tier5;
    if (t5?.weight && splits.length > 0) {
      let sqSum = 0;
      for (const s of splits) {
        const aspect = Math.min(s.w, s.h) / Math.max(s.w, s.h);
        sqSum += aspect * aspect;
      }
      tier5 = (sqSum / splits.length) * binArea * t5.weight;
    }

    // ── Tiebreaker ──────────────────────────────────────
    let tiebreaker = 0;
    const tb = T.tiebreaker;
    if (tb?.weight && tb?.mode === 'direcao') {
      if (this.direcao === 'vertical') {
        tiebreaker = -cand.py * tb.weight;
      } else if (this.direcao === 'horizontal') {
        tiebreaker = -cand.px * tb.weight;
      }
    } else if (tb?.weight && tb?.mode === 'zigzag') {
      // ZigZag: prefere X menor na → phase, Y menor na ↓ phase
      if (this._zigzagDir > 0) {
        tiebreaker = -cand.px * tb.weight;
      } else {
        tiebreaker = -cand.py * tb.weight;
      }
    }

    return tier1 + tier2 + tier3 + tier4 + tier5 + tiebreaker;
  }

  // ──────────────────────────────────────────────────────────
  //  Split — standard MaxRects (vertical-first vs horizontal-first)
  // ──────────────────────────────────────────────────────────

  _splitRect(idx, px, py, pw, ph) {
    const fr = this.freeRects[idx];
    this.freeRects.splice(idx, 1);

    // Try both split strategies and pick the one with
    // the smaller maximum individual rect (less fragmentation).
    // direcao bias tilts the choice when the sizes are close.
    const vFirst = this._genSplitV(fr, px, py, pw, ph);
    const hFirst = this._genSplitH(fr, px, py, pw, ph);

    let maxV = vFirst.reduce((m, r) => Math.max(m, r.w * r.h), 0);
    let maxH = hFirst.reduce((m, r) => Math.max(m, r.w * r.h), 0);

    // splitBias (from strategy config): strong multiplier on the
    // DIS-favoured split orientation so the other is chosen.
    //   largura  → inflate V → hFirst chosen (fills X = CNC width)
    //   comprimento → inflate H → vFirst chosen (fills Y = CNC length)
    //   neutral (0) → pure geometric BRS decides
    const sb = this._strategy?.splitBias ?? 0;
    if (sb > 0) {
      if (this._strategy?.zigzag) {
        if (this._zigzagDir > 0) maxH *= sb;   // → phase: vFirst (expande p/ direita)
        else maxV *= sb;                        // ↓ phase: hFirst (expande p/ baixo)
      } else if (this.direcao === 'vertical') {
        maxV *= sb;
      } else if (this.direcao === 'horizontal') {
        maxH *= sb;
      }
    }

    const chosen = maxV <= maxH ? vFirst : hFirst;

    for (const r of chosen) {
      if (r.w > 0 && r.h > 0) this.freeRects.push(r);
    }

    this._mergeFreeRects();
    this._prune();
  }

  /**
   * Vertical-first split:
   *   RIGHT:  piece height × remainder width
   *   BOTTOM: full width  × remainder height
   */
  _genSplitV(fr, px, py, pw, ph) {
    const r = [];
    if (pw < fr.w) r.push({ x: px + pw, y: fr.y, w: fr.w - pw, h: ph });
    if (ph < fr.h) r.push({ x: fr.x, y: py + ph, w: fr.w, h: fr.h - ph });
    return r;
  }

  /**
   * Horizontal-first split:
   *   BOTTOM: full width  × remainder height
   *   RIGHT:  remainder width × full height
   */
  _genSplitH(fr, px, py, pw, ph) {
    const r = [];
    if (ph < fr.h) r.push({ x: fr.x, y: py + ph, w: fr.w, h: fr.h - ph });
    if (pw < fr.w) r.push({ x: px + pw, y: fr.y, w: fr.w - pw, h: fr.h });
    return r;
  }

  // ──────────────────────────────────────────────────────────
  //  Merge + Prune
  // ──────────────────────────────────────────────────────────

  /**
   * Merge adjacent free rectangles that share a full edge.
   *
   * Two merge passes:
   *   - Horizontal: same y / same height, touching x-edges.
   *   - Vertical:   same x / same width,  touching y-edges.
   *
   * Repeats until no more merges are possible.
   */
  _mergeFreeRects() {
    let dirty = true;
    while (dirty) {
      dirty = false;
      const list = this.freeRects;
      for (let i = list.length - 1; i >= 0; i--) {
        for (let j = i - 1; j >= 0; j--) {
          const a = list[i];
          const b = list[j];

          // Horizontal merge: same row
          if (a.y === b.y && a.h === b.h) {
            if (a.x + a.w === b.x) {
              // a is left of b → extend b leftwards
              b.x = a.x;
              b.w = a.w + b.w;
              list.splice(i, 1);
              dirty = true;
              break;
            }
            if (b.x + b.w === a.x) {
              // b is left of a → extend b rightwards
              b.w = a.w + b.w;
              list.splice(i, 1);
              dirty = true;
              break;
            }
          }

          // Vertical merge: same column
          if (a.x === b.x && a.w === b.w) {
            if (a.y + a.h === b.y) {
              // a is above b → extend b upwards
              b.y = a.y;
              b.h = a.h + b.h;
              list.splice(i, 1);
              dirty = true;
              break;
            }
            if (b.y + b.h === a.y) {
              // b is above a → extend b downwards
              b.h = a.h + b.h;
              list.splice(i, 1);
              dirty = true;
              break;
            }
          }
        }
        if (dirty) break;
      }
    }
  }

  /**
   * Remove free rectangles fully contained within another.
   */
  _prune() {
    const list = this.freeRects;
    for (let i = list.length - 1; i >= 0; i--) {
      for (let j = list.length - 1; j >= 0; j--) {
        if (i !== j && _contains(list[j], list[i])) {
          list.splice(i, 1);
          break;
        }
      }
    }
  }
}

/** True if rect `a` fully contains rect `b` */
function _contains(a, b) {
  return a.x <= b.x &&
         a.y <= b.y &&
         a.x + a.w >= b.x + b.w &&
         a.y + a.h >= b.y + b.h;
}

// ────────────────────────────────────────────────────────────
//  Nest — high-level orchestrator
// ────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────
//  Repeat-call cache (legacy multi-call loop)
// ────────────────────────────────────────────────────────────

/**
 * Deterministic key for a single-sheet legacy call.
 * Covers the first 20 pieces + dimensions + rotation + margin + borda.
 */
function _callKey(pieces, sheetW, sheetH, opts) {
  let h = sheetW + 'x' + sheetH;
  h += '|r=' + (opts.rotation !== false);
  h += '|m=' + (opts.margin || 0);
  h += '|b=' + (opts.borda_mm || 0);
  h += '|s=' + (opts.direcao || '');
  h += '|e=' + (opts.estrategia != null ? opts.estrategia : '-1');
  h += '|l=' + (opts.lookAhead !== undefined ? opts.lookAhead : 1);
  h += '|d=' + (parseFloat(opts.densidade) || 0);
  h += '|v=' + (parseFloat(opts.velocidadeCorte) || 0);
  h += '|a=' + (parseInt(opts.areaMinRetalho, 10) || 0);
  h += '|fe=' + (opts.filterEspessura || 0);
  h += '|se=' + (parseFloat(opts.sheetEspessura) || 0);
  h += '|fm=' + (opts.filterMaterial || 0);
  h += '|sm=' + (opts.sheetMaterial || '');
  const limit = Math.min(pieces.length, 20);
  for (let i = 0; i < limit; i++) {
    const p = pieces[i];
    h += '|' + (p.w|0) + 'x' + (p.h|0) + (p.label||'');
  }
  return h;
}

const _callCache = new Map();
const _CACHE_MAX = 100;

// ────────────────────────────────────────────────────────────
//  Nest — high-level orchestrator
// ────────────────────────────────────────────────────────────

/**
 * Run MaxRects nesting for a set of pieces across one or more sheets.
 *
 * Two calling conventions:
 *
 * 1. Multi-sheet (new):  nest(pieces, sheetsArray, opts)
 *    @param {Array}  sheetsArray - [{ width, height, count? }, ...]
 *      Sheets are processed in area-ascending order (smallest first).
 *      `count` is the number of physical sheets of this size (0 = unlimited).
 *      Pieces allocated in earlier sheet groups are removed from later ones.
 *
 * 2. Single-sheet (legacy):  nest(pieces, sheetW, sheetH, opts)
 *    Backward-compatible. When maxSheets is 0 (default), the function
 *    detects repeated identical calls and increments `vezes_cortada`
 *    on previously-cached sheets instead of generating duplicate layouts.
 *
 * @param {Array} pieces - [{ w, h, label?, quantity?, espessura_mm? }]
 * @param {number|Array} sheetW - Sheet width (mm) or array of sheet descriptors
 * @param {number|object} [sheetH] - Sheet height (mm) or options object (when sheetW is array)
 * @param {object} [opts]
 * @param {boolean} [opts.rotation=true]     - Allow 90° rotation
 * @param {number}  [opts.margin=0]          - Gap between pieces in mm
 * @param {number}  [opts.lookAhead=1]       - Look-ahead depth (0 = greedy)
 * @param {number}  [opts.maxSheets=0]       - Max sheets in legacy mode (0 = unlimited). Ignored in multi-sheet mode.
 * @param {number}  [opts.borda_mm=0]        - Sheet border deducted from each edge (mm)
 * @param {number}  [opts.densidade=0]       - Material density g/cm³ (0 = skip). Steel ≈ 7.85
 * @param {number}  [opts.velocidadeCorte=0] - Cutting constant mm²/min (0 = skip). Formula: perim / (K / esp)
 * @param {number}  [opts.areaMinRetalho=0]  - Min waste area in mm² (0 = skip retalhos)
 * @param {string}  [opts.direcao='']        - Nesting sense: '' (auto), 'vertical' (prefer width), 'horizontal' (prefer height)
 * @param {number}  [opts.repeticoes=0]      - 0 = each sheet returned individually (default). 1 = collapse identical layouts, counter tracks repetitions.
 *
 * Each returned sheet has `vezes_cortada` — how many physical copies of this layout are needed.
 * In legacy mode with maxSheets=0 (the default), `vezes_cortada` is auto-incremented on
 * repeated identical calls so the caller's loop produces the same layout N times with
 * the repetition count set correctly.
 *
 * @returns {{ sheets: Array, stats: object, unplaced: number }}
 */
function nest(pieces, sheetW, sheetH, opts = {}) {
  // New: nest(pieces, [{ width, height, count? }], opts)
  if (Array.isArray(sheetW)) {
    return _run(pieces, sheetW, sheetH || {});
  }

  // Legacy: nest(pieces, width, height, opts)
  const result = _run(pieces, [{ width: sheetW, height: sheetH, count: opts.maxSheets || 0 }], opts);

  // ── Repeat-call detection (legacy only, when maxSheets is 0) ──
  if (!opts.maxSheets) {
    const key = _callKey(pieces, sheetW, sheetH, opts);
    const cached = _callCache.get(key);
    if (cached) {
      cached.count++;
      for (const sheet of cached.result.sheets) {
        sheet.vezes_cortada = cached.count;
      }
      return cached.result;
    }
    // First call — cache it
    for (const sheet of result.sheets) sheet.vezes_cortada = 1;
    _callCache.set(key, { result, count: 1 });
    if (_callCache.size > _CACHE_MAX) {
      const firstKey = _callCache.keys().next().value;
      _callCache.delete(firstKey);
    }
  }

  return result;
}

/**
 * Internal runner — shared by legacy and multi-sheet entry points.
 */
function _run(pieces, sheetDescriptors, opts) {
  const rotation = opts.rotation !== false;
  const margin = Math.max(0, opts.margin || 0);
  const bordaMm = Math.max(0, opts.borda_mm || 0);
  const densidade = parseFloat(opts.densidade) || 0;
  const velocidadeCorte = parseFloat(opts.velocidadeCorte) || 0;
  const areaMinRetalho = Math.max(0, parseInt(opts.areaMinRetalho, 10) || 0);
  const direcao = ['vertical', 'horizontal'].includes(opts.direcao) ? opts.direcao : '';
  const estrategia = [0, 1, 2, 3].includes(opts.estrategia) ? opts.estrategia : -1;

  // When estrategia is set (0-3), load its config and override direcao
  const strategyCfg = estrategia >= 0 ? _estrategiaConfig(estrategia) : null;

  // Estrategia define lookAhead greedy (0) vs BRS (10); opts.lookAhead sobrepõe
  const lookAhead = opts.lookAhead !== undefined ? opts.lookAhead : (strategyCfg?.lookAhead ?? 1);

  if (estrategia >= 0) {
    console.log('[estrategia] usando estrategia=' + estrategia + ' (' + (strategyCfg?.label || '?') + ') direcao=' + (strategyCfg?.direcao || ''));
  }

  const { sortByAreaDesc } = require('./sort');

  // Expand quantities, carrying extra fields
  const expanded = [];
  for (const p of pieces) {
    const w = Number(p.w);
    const h = Number(p.h);
    if (w <= 0 || h <= 0) continue;
    const qty = Math.max(1, Math.floor(Number(p.quantity)) || 1);
    for (let i = 0; i < qty; i++) {
      expanded.push({
        w, h,
        label: p.label || '',
        material: p.material || '',
        espessura_mm: p.espessura_mm || 0
      });
    }
  }

  // Sort: estrategia provides its own sort comparator;
  // fallback to direcao-based sorting for backward compat.
  let sorted;
  if (strategyCfg?.sortComparator) {
    sorted = [...expanded].sort(strategyCfg.sortComparator);
  } else if (direcao === 'vertical') {
    sorted = [...expanded].sort((a, b) => (b.w * b.h) - (a.w * a.h) || a.h - b.h);
  } else if (direcao === 'horizontal') {
    sorted = [...expanded].sort((a, b) => (b.w * b.h) - (a.w * a.h) || a.w - b.w);
  } else {
    sorted = sortByAreaDesc(expanded);
  }

  if (sorted.length === 0) {
    return {
      sheets: [],
      stats: { totalSheets: 0, totalPieces: 0, totalArea: 0, avgUtilization: 0 },
      unplaced: 0
    };
  }

  // ── Sort sheets by area ASCENDING (smallest sheet first) ──
  const sortedSheets = [...sheetDescriptors].sort(
    (a, b) => (a.width * a.height) - (b.width * b.height)
  );

  const allSheets = [];
  let remaining = [...sorted];
  let totalUnplaced = 0;

  for (const grp of sortedSheets) {
    if (remaining.length === 0) break;

    // ── Filtro opcional por espessura ──────────────────────
    if (opts.filterEspessura) {
      const grpEsp = parseFloat(String(grp.espessura_mm != null ? grp.espessura_mm : opts.sheetEspessura).replace(',', '.')) || 0;
      if (grpEsp > 0) {
        remaining = remaining.filter(p =>
          !p.espessura_mm || Math.abs(p.espessura_mm - grpEsp) < 0.01
        );
        if (remaining.length === 0) continue;
      }
    }

    // ── Filtro opcional por material ───────────────────────
    if (opts.filterMaterial) {
      const grpMat = grp.material || opts.sheetMaterial || '';
      if (grpMat) {
        remaining = remaining.filter(p => !p.material || p.material === grpMat);
        if (remaining.length === 0) continue;
      }
    }

    const sheetW = grp.width;
    const sheetH = grp.height;
    const maxSheets = grp.count || 0; // 0 = unlimited for this group

    const effW = sheetW - 2 * bordaMm;
    const effH = sheetH - 2 * bordaMm;
    if (effW <= 0 || effH <= 0) continue;

    const sheetArea = effW * effH;
    const groupSheets = [];

    // ── Run MaxRects for this sheet group ──────────────────
    // Salva o conjunto original (filtrado) para reset quando repeticoes=1
    const _origRemaining = remaining.slice();
    let _loopGuard = 0;

    while (maxSheets === 0 || groupSheets.length < maxSheets) {
      if (++_loopGuard > 10000) throw new Error('Infinite loop detected in sheet generation');
      if (remaining.length === 0) {
        // Com repeticoes=1 e maxSheets definido: recicla as peças originais
        // para gerar mais chapas (cópias idênticas) até o limite.
        // Só recicla se as peças realmente geraram MAIS DE UMA chapa
        // (groupSheets.length > 1). Se couberam todas numa chapa só,
        // não há motivo para repetir — só 1 chapa será cortada.
        if (!(opts.repeticoes || 0) || maxSheets === 0) break;
        if (groupSheets.length > 1) remaining = _origRemaining.slice(); else break;
      }

      const bin = new MaxRectsBin(effW, effH, { margin, direcao, estrategia });
      const placed = [];
      const stillRemaining = [];

      for (let i = 0; i < remaining.length; i++) {
        const piece = remaining[i];
        const pos = bin.insert(piece.w, piece.h, {
          lookAhead,
          remaining: remaining.slice(i + 1),
          rotation
        });

        if (pos) {
          pos.label = piece.label;
          pos.espessura_mm = piece.espessura_mm || 0;
          pos.area = piece.w * piece.h;
          placed.push(pos);
        } else {
          stillRemaining.push(piece);
        }
      }

      if (placed.length === 0) {
        // Peças restantes não encaixam — com repeticoes=1 recicla
        if (!(opts.repeticoes || 0) || maxSheets === 0 || remaining.length === 0) break;
        if (groupSheets.length > 1) { remaining = _origRemaining.slice(); continue; } else break;
      }

      const usedArea = placed.reduce((s, p) => s + p.area, 0);
      groupSheets.push({
        pieces: placed,
        usedArea,
        utilization: Math.round((usedArea / sheetArea) * 10000) / 100,
        sheetWidth: sheetW,
        sheetHeight: sheetH
      });

      remaining.length = 0;
      remaining.push(...stillRemaining);
    }

    // ── Assign vezes_cortada ──────────────────────────────────
    if ((opts.repeticoes || 0) === 1) {
      // repeticoes=1: collapse identical layouts, counter = repetitions
      const totalGenerated = groupSheets.length;
      const fpMap = new Map(); // fingerprint → index in deduped[]
      const deduped = [];

      for (const sheet of groupSheets) {
        const fp = sheet.pieces
          .slice()
          .sort((a, b) => a.x - b.x || a.y - b.y)
          .map(p => `${p.x},${p.y},${p.width},${p.height},${p.rotated?1:0},${p.label}`)
          .join('|');
        if (fpMap.has(fp)) {
          deduped[fpMap.get(fp)].vezes_cortada++;
        } else {
          fpMap.set(fp, deduped.length);
          sheet.vezes_cortada = 1;
          deduped.push(sheet);
        }
      }

      groupSheets.length = 0;
      groupSheets.push(...deduped);
    } else {
      // repeticoes=0 (default): each sheet is individual
      for (const sheet of groupSheets) sheet.vezes_cortada = 1;
    }

    // ── Pass through extra metadata from descriptor ─────────
    for (const s of groupSheets) {
      for (const key of Object.keys(grp)) {
        if (key !== 'width' && key !== 'height' && key !== 'count') {
          s[key] = grp[key];
        }
      }
    }

    allSheets.push(...groupSheets);
  }

  // ── Stats ────────────────────────────────────────────────
  totalUnplaced = remaining.length;
  const totalPiecesPlaced = sorted.length - totalUnplaced;
  const totalAreaSq = sorted.reduce((s, p) => s + p.w * p.h, 0);
  const totalEffSheetArea = allSheets.reduce((s, sh) => {
    return s + (sh.sheetWidth - 2 * bordaMm) * (sh.sheetHeight - 2 * bordaMm);
  }, 0);

  // ── Post-process: border offset, weight, time, retalhos ──
  let pesoTotal = 0;
  let tempoTotal = 0;

  for (const sheet of allSheets) {
    let sheetPeso = 0;
    let sheetTempo = 0;

    for (const p of sheet.pieces) {
      // Border offset
      if (bordaMm > 0) {
        p.x += bordaMm;
        p.y += bordaMm;
      }

      // Perimeter
      const perim = (p.width + p.height) * 2;
      p.perimetro_mm = perim;

      // Weight
      const esp = p.espessura_mm || 0;
      if (densidade > 0 && esp > 0) {
        const peso = Math.round(esp * p.width * p.height * densidade / 1000000 * 1000) / 1000;
        p.peso_kg = peso;
        sheetPeso += peso;
      }

      // Cutting time
      if (velocidadeCorte > 0 && esp > 0) {
        const vel = velocidadeCorte / esp;
        const tempo = Math.round(perim / vel * 100) / 100;
        p.tempo_corte_min = tempo;
        sheetTempo += tempo;
      }
    }

    if (densidade > 0) {
      sheet.peso_total_kg = Math.round(sheetPeso * 1000) / 1000;
      pesoTotal += sheetPeso;
    }
    if (velocidadeCorte > 0) {
      sheet.tempo_corte_min = Math.round(sheetTempo * 100) / 100;
      tempoTotal += sheetTempo;
    }

    // Retalhos
    if (areaMinRetalho > 0) {
      sheet.retalhos = calcularRetalhos(sheet.pieces, sheet.sheetWidth, sheet.sheetHeight, areaMinRetalho);
    }
  }

  // ── Build stats ─────────────────────────────────────────
  const stats = {
    totalSheets: allSheets.length,
    totalPieces: totalPiecesPlaced,
    totalArea: totalAreaSq,
    avgUtilization: totalEffSheetArea > 0
      ? Math.round((totalAreaSq / totalEffSheetArea) * 10000) / 100
      : 0
  };

  if (densidade > 0) {
    stats.peso_total_kg = Math.round(pesoTotal * 1000) / 1000;
  }
  if (velocidadeCorte > 0) {
    stats.tempo_corte_total_min = Math.round(tempoTotal * 100) / 100;
  }
  if (areaMinRetalho > 0) {
    stats.retalhosAproveitaveis = allSheets.reduce((s, sh) => s + (sh.retalhos || []).length, 0);
  }

  return { sheets: allSheets, stats, unplaced: totalUnplaced };
}

// ────────────────────────────────────────────────────────────
//  Retalhos (waste) calculation
// ────────────────────────────────────────────────────────────

/**
 * Scan placed pieces and find rectangular gaps (retalhos / waste).
 *
 * Divides the sheet into horizontal strips at each piece's top and bottom
 * edges, then finds empty runs within each strip.
 */
function calcularRetalhos(pieces, sheetW, sheetH, areaMin) {
  if (!pieces || pieces.length === 0) return [];

  const occupied = pieces.map(p => ({ x: p.x, y: p.y, w: p.width, h: p.height }));

  const ySet = new Set();
  for (const o of occupied) { ySet.add(o.y); ySet.add(o.y + o.h); }
  const yPoints = [...ySet].sort((a, b) => a - b);

  const retalhos = [];

  for (let yi = 0; yi < yPoints.length - 1; yi++) {
    const y0 = yPoints[yi];
    const y1 = yPoints[yi + 1];
    const stripH = y1 - y0;
    if (stripH < 1) continue;

    // Get occupiers that intersect this strip
    const occ = occupied
      .filter(o => o.y < y1 && o.y + o.h > y0)
      .sort((a, b) => a.x - b.x);

    let cursorX = 0;
    for (const o of occ) {
      if (o.x > cursorX + 1) {
        const gapW = o.x - cursorX;
        if (gapW * stripH >= areaMin) {
          retalhos.push({
            x: Math.round(cursorX * 10) / 10,
            y: Math.round(y0 * 10) / 10,
            width: Math.round(gapW * 10) / 10,
            height: Math.round(stripH * 10) / 10,
            area: Math.round(gapW * stripH * 100) / 100
          });
        }
      }
      if (o.x + o.w > cursorX) cursorX = o.x + o.w;
    }

    // Gap at right edge
    if (sheetW > cursorX + 1) {
      const gapW = sheetW - cursorX;
      if (gapW * stripH >= areaMin) {
        retalhos.push({
          x: Math.round(cursorX * 10) / 10,
          y: Math.round(y0 * 10) / 10,
          width: Math.round(gapW * 10) / 10,
          height: Math.round(stripH * 10) / 10,
          area: Math.round(gapW * stripH * 100) / 100
        });
      }
    }
  }

  // Merge adjacent in same row
  if (retalhos.length > 1) {
    retalhos.sort((a, b) => a.y - b.y || a.x - b.x);
    for (let i = 0; i < retalhos.length - 1; i++) {
      const r1 = retalhos[i];
      const r2 = retalhos[i + 1];
      if (r1.y === r2.y && r1.height === r2.height && r1.x + r1.width === r2.x) {
        r1.width += r2.width;
        r1.area += r2.area;
        retalhos.splice(i + 1, 1);
        i--;
      }
    }
  }

  return retalhos;
}

module.exports = { MaxRectsBin, nest };
