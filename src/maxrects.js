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
 * Maps estrategia (0|1|2) to a full algorithm configuration:
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
 * @param {number} estrategia — 0=Vertical, 1=Horizontal, 2=Supreme
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

function _strategyConfig(estrategia) {
  const e = [0, 1, 2].includes(estrategia) ? estrategia : 0;

  switch (e) {
    // ═══ Vertical (0) — pure vertical columns ═══
    // BRS + mode 'direcao' + fit-only rotation.
    // mode='direcao': cand.py × binArea/binH → prefere BOTTOM → colunas consomem Y.
    // fit-only: não rotaciona a menos que a orientação original não caiba.
    case 0:
      return {
        label: 'Vertical',
        direcao: 'vertical',
        sortComparator:
          (a, b) => b.w - a.w || (b.w * b.h) - (a.w * a.h),
        lookAhead: 0,
        splitBias: 40,
        zonaPct: 1,
        rotationMode: 'fit-only',
        tiers: {
          tier2: { weight: 1.0, mode: 'direcao' },
          tier3: { weight: 0 },
          tier4: { weight: 0 },
          tier5: { weight: 0 },
          tiebreaker: { weight: 0 }
        }
      };

    // ═══ Horizontal (1) — pure horizontal rows ═══
    // mode='direcao': cand.px × binArea/binW → prefere RIGHT → fileiras consomem X.
    // fit-only: só rotaciona se necessário.
    case 1:
      return {
        label: 'Horizontal',
        direcao: 'horizontal',
        sortComparator:
          (a, b) => b.h - a.h || (b.w * b.h) - (a.w * a.h),
        lookAhead: 0,
        splitBias: 60,
        zonaPct: 1,
        rotationMode: 'fit-only',
        tiers: {
          tier2: { weight: 1.0, mode: 'direcao' },
          tier3: { weight: 0 },
          tier4: { weight: 0 },
          tier5: { weight: 0 },
          tiebreaker: { weight: 0 }
        }
      };

    // ═══ Supreme (2) — rectangular block + zones + adaptive split ═══
    // BAF (Best Area Fit): large piece→large space, small piece→small space.
    // Otimizado via random search (N=500, 2026-07-15) c/ filtro material+espessura.
    case 2:
      return {
        label: 'Supreme',
        direcao: '',
        sortComparator: (a, b) => (b.w * b.h) - (a.w * a.h),
        lookAhead: 0,
        splitBias: 38,
        zonaPct: 17,
        beamWidth: 35,
        tiers: {
          tier2: { weight: 4.76, mode: 'baf' },
          tier3: { weight: 0 },
          tier4: { weight: 0 },
          tier5: { weight: 4.75 },
          tiebreaker: { weight: 0 }
        },
        scoreLayoutWeights: { compactness: 0.69, avgFit: 0.95, brsNorm: 0.17 },
        adaptiveSplit: 0.5,
        zoneThreshold: 0.99,
        zonePenalty: 5.0,
        zoneSpanWeight: 0.5
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
   * @param {number} [opts.estrategia=0]  - 0=Vertical, 1=Horizontal, 2=Supreme
   * @param {object} [opts.tiers]        - Override tiers for the strategy
   * @param {string} [opts.sortMode]     - Override sort mode
   * @param {number} [opts.splitBias]    - Override split bias
   * @param {number} [opts.lookAheadOverride] - Override look-ahead depth
   * @param {object} [opts.scoreLayoutWeights] - Override _scoreLayout weights { compactness, avgFit, brsNorm }
   */
  constructor(width, height, opts = {}) {
    this.binW = width;
    this.binH = height;
    this.margin = opts.margin || 0;
    this.direcao = opts.direcao || '';
    // NOVO: freeRects opcional (polígono). Quando omitido, 1 ret = chapa inteira.
    this.freeRects = opts.freeRects
      ? opts.freeRects.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h }))
      : [{ x: 0, y: 0, w: width, h: height }];
    // NOVO: áreas não-usáveis dentro do bounding box do polígono
    this.voidRects = opts.voidRects
      ? opts.voidRects.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h }))
      : [];
    // NOVO: snapshot dos retângulos originais — usado no merge check
    this.sheetRects = this.freeRects.map(r => ({ ...r }));
    this.placed = [];

    // estrategia -1 = backward compat (classic direcao mode, no overrides)
    const est = [0, 1, 2].includes(opts.estrategia) ? opts.estrategia : -1;
    this.estrategia = est;
    if (est >= 0) {
      const cfg = _strategyConfig(est);
      this._strategy = cfg;
      this.direcao = cfg.direcao; // strategy direcao overrides passed direcao

      // Aplica overrides externos (disputa de agents)
      if (opts.tiers) {
        this._strategy.tiers = opts.tiers;
      }
      if (opts.sortMode) {
        const sortFns = {
          'area-desc': (a, b) => (b.w * b.h) - (a.w * a.h),
          'width-desc': (a, b) => b.w - a.w || (b.w * b.h) - (a.w * a.h),
          'height-desc': (a, b) => b.h - a.h || (b.w * b.h) - (a.w * a.h)
        };
        if (sortFns[opts.sortMode]) {
          this._strategy.sortComparator = sortFns[opts.sortMode];
        }
      }
      if (opts.splitBias !== undefined) {
        this._strategy.splitBias = opts.splitBias;
      }
      if (opts.lookAheadOverride !== undefined) {
        this._strategy.lookAhead = opts.lookAheadOverride;
      }
      // zonaPct da estratégia, com override externo se explícito
      this._strategy.zonaPct = opts.zonaPct !== undefined ? opts.zonaPct : (cfg.zonaPct || 80);
      // scoreLayoutWeights, com override externo se explícito
      if (opts.scoreLayoutWeights) {
        this._strategy.scoreLayoutWeights = opts.scoreLayoutWeights;
      }
      // Parâmetros de zoneamento, com override externo
      if (opts.zoneThreshold !== undefined) {
        this._strategy.zoneThreshold = opts.zoneThreshold;
      }
      if (opts.zonePenalty !== undefined) {
        this._strategy.zonePenalty = opts.zonePenalty;
      }
      if (opts.adaptiveSplit !== undefined) {
        this._strategy.adaptiveSplit = opts.adaptiveSplit;
      }
      if (opts.zoneSpanWeight !== undefined) {
        this._strategy.zoneSpanWeight = opts.zoneSpanWeight;
      }
    } else {
      this._strategy = null;
    }

    this._lastPx = -1;
    this._lastPy = -1;
    this._bboxMinX = Infinity;
    this._bboxMinY = Infinity;
    this._bboxMaxX = -Infinity;
    this._bboxMaxY = -Infinity;
    this._placedArea = 0;     // soma das áreas das peças colocadas (para density scoring)
    this._alignAxis = null;   // 'x' (horizontal row) or 'y' (vertical column)
    this._alignW = 0;         // piece width  that triggered alignment
    this._alignH = 0;         // piece height that triggered alignment
    this._alignAnchorPos = -1; // py (alignAxis='x') ou px (alignAxis='y')
  }

  /**
   * Deep clone this bin — usado pelo Beam Search para bifurcar caminhos.
   */
  clone() {
    const c = Object.create(MaxRectsBin.prototype);
    c.binW = this.binW;
    c.binH = this.binH;
    c.margin = this.margin;
    c.direcao = this.direcao;
    c.estrategia = this.estrategia;
    c.freeRects = this.freeRects.map(r => ({ ...r }));
    c.placed = this.placed.map(p => ({ ...p }));
    c._placedArea = this._placedArea;
    c._bboxMinX = this._bboxMinX;
    c._bboxMinY = this._bboxMinY;
    c._bboxMaxX = this._bboxMaxX;
    c._bboxMaxY = this._bboxMaxY;
    c._lastPx = this._lastPx;
    c._lastPy = this._lastPy;
    c._alignAxis = this._alignAxis;
    c._alignW = this._alignW;
    c._alignH = this._alignH;
    c._alignAnchorPos = this._alignAnchorPos;
    c._strategy = this._strategy
      ? JSON.parse(JSON.stringify(this._strategy))
      : null;
    c.voidRects = this.voidRects.map(r => ({ ...r }));
    c.sheetRects = this.sheetRects.map(r => ({ ...r }));
    return c;
  }

  /**
   * Place a single piece (w × h) into the bin.
   *
   * @param {number} w - Piece width
   * @param {number} h - Piece height
   * @param {object} [opts]
   * @param {number} [opts.lookAhead]   - Override strategy lookAhead (optional)
   * @param {Array}  [opts.remaining=[]] - Remaining pieces for look-ahead
   * @param {boolean|string} [opts.rotation=true] - Allow 90° rotation. Pass 'fit-only' to only rotate when original orientation doesn't fit anywhere
   * @returns {object|null} Placed rect { x, y, width, height, rotated } or null
   */
  insert(w, h, opts = {}) {
    // lookAhead from strategy config unless explicitly overridden
    const lookAhead = opts.lookAhead != null ? opts.lookAhead : (this._strategy?.lookAhead ?? 1);
    const { remaining = [], rotation = true } = opts;
    const mw = w + this.margin;
    const mh = h + this.margin;

    // ── rotationMode: 'fit-only' tenta sem rotação primeiro ──
    // Só rotaciona se a orientação original não couber em nenhum free rect.
    const candidates = [];

    // Pass 1: orientação original
    for (let i = 0; i < this.freeRects.length; i++) {
      const fr = this.freeRects[i];
      if (mw <= fr.w && mh <= fr.h) {
        candidates.push({
          frIdx: i, px: fr.x, py: fr.y,
          pw: mw, ph: mh,
          rotated: false
        });
      }
    }

    // Pass 2: se nada coube sem rotação, tenta com rotação
    if (candidates.length === 0 && rotation === 'fit-only') {
      for (let i = 0; i < this.freeRects.length; i++) {
        const fr = this.freeRects[i];
        if (mh <= fr.w && mw <= fr.h) {
          candidates.push({
            frIdx: i, px: fr.x, py: fr.y,
            pw: mh, ph: mw,
            rotated: true
          });
        }
      }
    }

    // Pass 3: modo normal (ambas orientações juntas)
    if (candidates.length === 0 && rotation && rotation !== 'fit-only') {
      for (let i = 0; i < this.freeRects.length; i++) {
        const fr = this.freeRects[i];
        if (mw <= fr.w && mh <= fr.h) {
          candidates.push({
            frIdx: i, px: fr.x, py: fr.y,
            pw: mw, ph: mh,
            rotated: false
          });
        }
        if (mh <= fr.w && mw <= fr.h) {
          candidates.push({
            frIdx: i, px: fr.x, py: fr.y,
            pw: mh, ph: mw,
            rotated: true
          });
        }
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
    this._placedArea += placedRect.width * placedRect.height;
    this._splitRect(best.frIdx, best.px, best.py, best.pw, best.ph);

    // ── Clip free rects that overlap the newly placed piece ──
    // _splitRect only acts on the free rect where the piece was placed.
    // Other free rects (from previous splits elsewhere) may overlap the
    // new piece — clip them to prevent future placements from colliding.
    const cx = best.px, cy = best.py, cw = best.pw, ch = best.ph;
    for (let fi = this.freeRects.length - 1; fi >= 0; fi--) {
      const fr = this.freeRects[fi];
      if (fr.x >= cx + cw || fr.x + fr.w <= cx ||
          fr.y >= cy + ch || fr.y + fr.h <= cy) continue; // no overlap

      // Clip: split overlapping free rect into up to 4 non-overlapping pieces
      const clipped = [];
      // Left strip (x < cx)
      if (fr.x < cx) clipped.push({ x: fr.x, y: fr.y, w: cx - fr.x, h: fr.h });
      // Right strip (x > cx + cw)
      if (fr.x + fr.w > cx + cw) clipped.push({ x: cx + cw, y: fr.y, w: fr.x + fr.w - (cx + cw), h: fr.h });
      // Top strip (y < cy) — overlaps only in the X range of the clip rect
      if (fr.y < cy) {
        const nx = Math.max(fr.x, cx);
        const nw = Math.min(fr.x + fr.w, cx + cw) - nx;
        if (nw > 0) clipped.push({ x: nx, y: fr.y, w: nw, h: cy - fr.y });
      }
      // Bottom strip (y > cy + ch)
      if (fr.y + fr.h > cy + ch) {
        const nx = Math.max(fr.x, cx);
        const nw = Math.min(fr.x + fr.w, cx + cw) - nx;
        if (nw > 0) clipped.push({ x: nx, y: cy + ch, w: nw, h: fr.y + fr.h - (cy + ch) });
      }

      this.freeRects.splice(fi, 1);
      for (const c of clipped) {
        if (c.w > 0 && c.h > 0) this.freeRects.push(c);
      }
    }

    // NOVO: clip também contra voidRects (polígono)
    for (let fi = this.freeRects.length - 1; fi >= 0; fi--) {
      const fr = this.freeRects[fi];
      for (const vr of this.voidRects) {
        if (fr.x >= vr.x + vr.w || fr.x + fr.w <= vr.x ||
            fr.y >= vr.y + vr.h || fr.y + fr.h <= vr.y) continue;
        // Clip: subtrai void rect do free rect
        const clipped = [];
        if (fr.x < vr.x) clipped.push({ x: fr.x, y: fr.y, w: vr.x - fr.x, h: fr.h });
        if (fr.x + fr.w > vr.x + vr.w) clipped.push({ x: vr.x + vr.w, y: fr.y, w: fr.x + fr.w - (vr.x + vr.w), h: fr.h });
        if (fr.y < vr.y) {
          const nx = Math.max(fr.x, vr.x);
          const nw = Math.min(fr.x + fr.w, vr.x + vr.w) - nx;
          if (nw > 0) clipped.push({ x: nx, y: fr.y, w: nw, h: vr.y - fr.y });
        }
        if (fr.y + fr.h > vr.y + vr.h) {
          const nx = Math.max(fr.x, vr.x);
          const nw = Math.min(fr.x + fr.w, vr.x + vr.w) - nx;
          if (nw > 0) clipped.push({ x: nx, y: vr.y + vr.h, w: nw, h: fr.y + fr.h - (vr.y + vr.h) });
        }
        this.freeRects.splice(fi, 1);
        for (const c of clipped) {
          if (c.w > 0 && c.h > 0) this.freeRects.push(c);
        }
        break; // fr alterado, próximo fi
      }
    }

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

    // Pick the better split (com bias direcional do splitBias da estratégia)
    // Usa splitBias para alinhar com _splitRect — se sem estratégia, fallback 5x.
    let maxV = vSplits.reduce((m, r) => Math.max(m, r.w * r.h), 0);
    let maxH = hSplits.reduce((m, r) => Math.max(m, r.w * r.h), 0);

    const sb = this._strategy?.splitBias ?? 0;
    if (sb > 0) {
      if (this.direcao === 'vertical') {
        maxV *= sb;
      } else if (this.direcao === 'horizontal') {
        maxH *= sb;
      }
    } else {
      // Fallback clássico — bias suave 5x para direção sem estratégia
      if (this.direcao === 'vertical') {
        maxV *= 5;
      } else if (this.direcao === 'horizontal') {
        maxH *= 5;
      }
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

        // Penalidade por rotação: quando a peça faz parte de um lote
        // alinhado, rotacionar aumenta a dimensão errada.
        if (this._alignAxis && cand.rotated) {
          tier2 -= binArea * 0.08;
        }

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
      } else if (t2?.mode === 'density') {
        // ── Densidade do bounding box ──────────────────────
        // Score = (área total colocada) / (área do bbox resultante).
        // Quanto mais compacto o agrupamento, maior o score.
        // Isso penaliza espalhamento desnecessário dentro da chapa.
        const newMinX = Math.min(this._bboxMinX, cand.px);
        const newMinY = Math.min(this._bboxMinY, cand.py);
        const newMaxX = Math.max(this._bboxMaxX, cand.px + cand.pw);
        const newMaxY = Math.max(this._bboxMaxY, cand.py + cand.ph);
        const bboxW = Math.max(1, newMaxX - newMinX);
        const bboxH = Math.max(1, newMaxY - newMinY);
        const totalArea = this._placedArea + cand.pw * cand.ph;
        tier2 = (totalArea / (bboxW * bboxH)) * binArea;
      } else if (t2?.mode === 'baf') {
        // ── Best Area Fit (BAF) normalizado ────────────────
        // Prefere colocação onde a peça preenche a maior proporção
        // do retângulo livre. pieceArea/freeArea = 1 = perfeito.
        // Normalizado por binArea para escala comparável com outros tiers.
        const freeArea = Math.max(1, fr.w * fr.h);
        const pieceArea = cand.pw * cand.ph;
        const fitRatio = pieceArea / freeArea; // 0..1, maior = melhor
        tier2 = fitRatio * binArea;
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
      if (this.direcao === 'vertical') {
        // Vertical = colunas → consumir Y → recompensa preencher altura (ph / fr.h)
        tier3 = (cand.ph / fr.h) * binArea * t3.weight;
      } else if (this.direcao === 'horizontal') {
        // Horizontal = fileiras → consumir X → recompensa preencher largura (pw / fr.w)
        tier3 = (cand.pw / fr.w) * binArea * t3.weight;
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

    // ── Tier 5: squareness bonus + anti-gap ─────────────
    // Squareness: prefere splits que deixam retângulos aproximadamente
    // quadrados (aspect ratio ~1.0). Penaliza splits que criam "tiras"
    // (aspect ratio extremo < 1:4 ou > 4:1), que geram espaço inútil
    // dentro do bbox da distribuição.
    let tier5 = 0;
    const t5 = T.tier5;
    if (t5?.weight && splits.length > 0) {
      let sqSum = 0;
      let stripCount = 0;
      for (const s of splits) {
        const aspect = Math.min(s.w, s.h) / Math.max(s.w, s.h);
        sqSum += aspect * aspect;
        // Anti-gap: conta quantos splits são "tiras" (aspect < 1:4)
        if (aspect < 0.25) stripCount++;
      }
      const avgSquare = sqSum / splits.length;
      // Cada tira reduz 25% do bonus (max 100%)
      const stripPenalty = Math.min(1, stripCount * 0.25);
      tier5 = avgSquare * (1 - stripPenalty) * binArea * t5.weight;
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
      if (this.direcao === 'vertical') {
        maxV *= sb;
      } else if (this.direcao === 'horizontal') {
        maxH *= sb;
      }
    }

    // ── Adaptive split (lightmap-inspired) ──────────────
    // Quando a peça preenche >60% de uma dimensão, favorece
    // o split que empilha na outra dimensão.
    //   Peça larga (fillW > adaptThreshold) → inflate maxV → hFirst
    //   Peça alta  (fillH > adaptThreshold) → inflate maxH → vFirst
    const adaptThreshold = this._strategy?.adaptiveSplit ?? 0;
    if (adaptThreshold > 0) {
      const fillW = pw / fr.w;
      const fillH = ph / fr.h;
      if (fillW > adaptThreshold && fillH < adaptThreshold) {
        maxV *= 2; // wide piece → prefer horizontal split (stack Y)
      } else if (fillH > adaptThreshold && fillW < adaptThreshold) {
        maxH *= 2; // tall piece → prefer vertical split (extend X)
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
   * Merge adjacent free rectangles — standard + agressivo.
   *
   * Passo 1 (standard): mesma y/mesma altura (horizontal) ou
   * mesma x/mesma largura (vertical), bordas encostando.
   *
   * Passo 2 (agressivo): retângulos com sobreposição parcial
   * num eixo e adjacentes no outro → união (bbox) se a área
   * extra não contiver peças colocadas.
   *
   * Repete até não haver mais merges.
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

          // ── Standard: mesma fileira ──
          if (a.y === b.y && a.h === b.h) {
            if (a.x + a.w === b.x) {
              b.x = a.x; b.w = a.w + b.w;
              list.splice(i, 1); dirty = true; break;
            }
            if (b.x + b.w === a.x) {
              b.w = a.w + b.w;
              list.splice(i, 1); dirty = true; break;
            }
          }

          // ── Standard: mesma coluna ──
          if (a.x === b.x && a.w === b.w) {
            if (a.y + a.h === b.y) {
              b.y = a.y; b.h = a.h + b.h;
              list.splice(i, 1); dirty = true; break;
            }
            if (b.y + b.h === a.y) {
              b.h = a.h + b.h;
              list.splice(i, 1); dirty = true; break;
            }
          }

          // ── Agressivo: sobreposição parcial + adjacente ──
          // Horizontal overlap + vertical adjacency
          if (a.x < b.x + b.w && b.x < a.x + a.w) {
            const adjacent = (a.y + a.h === b.y) || (b.y + b.h === a.y);
            if (adjacent) {
              const ux = Math.min(a.x, b.x);
              const uy = Math.min(a.y, b.y);
              const uw = Math.max(a.x + a.w, b.x + b.w) - ux;
              const uh = Math.max(a.y + a.h, b.y + b.h) - uy;
              // NOVO: não mergear se união extrapola sheetRect original (polígono)
              if (this.sheetRects.length > 0 && !_rectContainedInAny(ux, uy, uw, uh, this.sheetRects)) {
                continue;
              }
              if (!_rectOverlapsAny(ux, uy, uw, uh, this.placed, this.margin)) {
                a.x = ux; a.y = uy; a.w = uw; a.h = uh;
                list.splice(j, 1); dirty = true; break;
              }
            }
          }

          // Vertical overlap + horizontal adjacency
          if (!dirty && a.y < b.y + b.h && b.y < a.y + a.h) {
            const adjacent = (a.x + a.w === b.x) || (b.x + b.w === a.x);
            if (adjacent) {
              const ux = Math.min(a.x, b.x);
              const uy = Math.min(a.y, b.y);
              const uw = Math.max(a.x + a.w, b.x + b.w) - ux;
              const uh = Math.max(a.y + a.h, b.y + b.h) - uy;
              // NOVO: não mergear se união extrapola sheetRect original (polígono)
              if (this.sheetRects.length > 0 && !_rectContainedInAny(ux, uy, uw, uh, this.sheetRects)) {
                continue;
              }
              if (!_rectOverlapsAny(ux, uy, uw, uh, this.placed, this.margin)) {
                a.x = ux; a.y = uy; a.w = uw; a.h = uh;
                list.splice(j, 1); dirty = true; break;
              }
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

  // ──────────────────────────────────────────────────────────
  //  Pós-compactação (tightening)
  // ──────────────────────────────────────────────────────────

  /**
   * Compacta o layout movendo cada peça o máximo possível para a
   * origem (esquerda + baixo), reduzindo a Dimensão Distrib.
   *
   * Algoritmo: ordena peças por distância da origem, depois para
   * cada peça tenta deslocar X→0 e Y→0 em steps de 5mm, verificando
   * colisão com as demais. Approach incremental com refinamento:
   * tenta steps grandes (step=16) depois refina (step=5).
   *
   * @param {Array} placed - Array de peças colocadas { x, y, width, height }
   * @param {number} margin - Margem entre peças em mm
   */
}

/**
 * Compactação pós-posicionamento: move cada peça o máximo possível
 * em direção à origem (0,0) sem colidir com as demais.
 * Reduz a Dimensão da Distribuição (bbox) sem alterar a alocação.
 *
 * Usada tanto no greedy path quanto no Beam Search.
 *
 * @param {Array} placed - Array de peças { x, y, width, height, ... }
 * @param {number} margin - Margem entre peças em mm
 */
function _compactLayout(placed, margin) {
  if (placed.length < 2) return;
  const m = Math.max(0, margin || 0);

  // Ordena por distância da origem (mais próximo primeiro)
  const sorted = [...placed].sort((a, b) => (a.x + a.y) - (b.x + b.y));

  for (const piece of sorted) {
    // 1. Tentar mover para esquerda (diminuir X)
    // Step grosso primeiro, depois refina
    const coarse = [16, 8, 5, 1];
    let bestX = piece.x;
    for (const step of coarse) {
      for (let tx = bestX - step; tx >= 0 && tx < piece.x; tx -= step) {
        if (!_rectCollides(tx, piece.y, piece.width, piece.height, piece, placed, m)) {
          bestX = tx;
        } else break;
      }
    }
    piece.x = bestX;

    // 2. Tentar mover para baixo (diminuir Y)
    let bestY = piece.y;
    for (const step of coarse) {
      for (let ty = bestY - step; ty >= 0 && ty < piece.y; ty -= step) {
        if (!_rectCollides(piece.x, ty, piece.width, piece.height, piece, placed, m)) {
          bestY = ty;
        } else break;
      }
    }
    piece.y = bestY;
  }
}

/** Verifica se um retângulo colide com alguma peça (excluindo self) */
function _rectCollides(x, y, w, h, self, all, margin) {
  for (const other of all) {
    if (other === self) continue;
    if (x < other.x + other.width + margin &&
        x + w + margin > other.x &&
        y < other.y + other.height + margin &&
        y + h + margin > other.y) {
      return true;
    }
  }
  return false;
}

/** True if rect `a` fully contains rect `b` */
function _contains(a, b) {
  return a.x <= b.x &&
         a.y <= b.y &&
         a.x + a.w >= b.x + b.w &&
         a.y + a.h >= b.y + b.h;
}

/** True if rect (x,y,w,h) overlaps any placed piece (considering margin) */
function _rectOverlapsAny(x, y, w, h, placed, margin) {
  const m = Math.max(0, margin || 0);
  for (const p of placed) {
    if (x < p.x + p.width + m &&
        x + w + m > p.x &&
        y < p.y + p.height + m &&
        y + h + m > p.y) {
      return true;
    }
  }
  return false;
}

/** True if rect (x,y,w,h) is fully contained in ANY of the given rects */
function _rectContainedInAny(x, y, w, h, rects) {
  for (const r of rects) {
    if (x >= r.x && y >= r.y &&
        x + w <= r.x + r.w &&
        y + h <= r.y + r.h) {
      return true;
    }
  }
  return false;
}

/**
 * Calcula voidRects (áreas não-usáveis) dados freeRects e bounding box.
 * Algoritmo: começa com bounding box, subtrai cada free rect, gera N retângulos.
 */
function _calcVoidRects(freeRects, bbW, bbH) {
  if (freeRects.length <= 1) return [];
  let remaining = [{ x: 0, y: 0, w: bbW, h: bbH }];
  for (const fr of freeRects) {
    const next = [];
    for (const r of remaining) {
      // Subtrai fr de r: até 4 retângulos
      if (fr.x > r.x) next.push({ x: r.x, y: r.y, w: fr.x - r.x, h: r.h });
      if (fr.x + fr.w < r.x + r.w) next.push({ x: fr.x + fr.w, y: r.y, w: r.x + r.w - (fr.x + fr.w), h: r.h });
      if (fr.y > r.y) {
        const ol = Math.max(r.x, fr.x);
        const or = Math.min(r.x + r.w, fr.x + fr.w);
        if (ol < or) next.push({ x: ol, y: r.y, w: or - ol, h: fr.y - r.y });
      }
      if (fr.y + fr.h < r.y + r.h) {
        const ol = Math.max(r.x, fr.x);
        const or = Math.min(r.x + r.w, fr.x + fr.w);
        if (ol < or) next.push({ x: ol, y: fr.y + fr.h, w: or - ol, h: r.y + r.h - (fr.y + fr.h) });
      }
    }
    remaining = next.filter(rr => rr.w > 0 && rr.h > 0);
  }
  return remaining;
}

// ═══════════════════════════════════════════════════════════
//  Nest — high-level orchestrator
// ═══════════════════════════════════════════════════════════

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
 *    Backward-compatible.
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
 * @param {number}  [opts.estrategia=-1]     - 0=Vertical (colunas), 1=Horizontal (fileiras), 2=Supreme (BRS+waste+adaptive). Overrides direcao when set (0-2). -1=disabled.
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

  return result;
}

/**
 * Internal runner — shared by legacy and multi-sheet entry points.
 */
function _run(pieces, sheetDescriptors, opts) {
  const rotation = opts.rotation === 'fit-only' ? 'fit-only' : opts.rotation !== false;
  const margin = Math.max(0, opts.margin || 0);
  const bordaMm = Math.max(0, opts.borda_mm || 0);
  const densidade = parseFloat(opts.densidade) || 0;
  const velocidadeCorte = parseFloat(opts.velocidadeCorte) || 0;
  const areaMinRetalho = Math.max(0, parseInt(opts.areaMinRetalho, 10) || 0);
  const direcao = ['vertical', 'horizontal'].includes(opts.direcao) ? opts.direcao : '';
  const estrategia = [0, 1, 2].includes(opts.estrategia) ? opts.estrategia : -1;

  // When estrategia is set (0-2), load its config and override direcao
  const strategyCfg = estrategia >= 0 ? _strategyConfig(estrategia) : null;

  // External override: opts.tiers substitui os tiers da estratégia
  // (usado pela disputa de agents para testar variações sem modificar o código)
  if (strategyCfg && opts.tiers) {
    strategyCfg.tiers = opts.tiers;
  }
  if (strategyCfg && opts.sortMode) {
    const sortFns = {
      'area-desc': (a, b) => (b.w * b.h) - (a.w * a.h),
      'width-desc': (a, b) => b.w - a.w || (b.w * b.h) - (a.w * a.h),
      'height-desc': (a, b) => b.h - a.h || (b.w * b.h) - (a.w * a.h)
    };
    if (sortFns[opts.sortMode]) {
      strategyCfg.sortComparator = sortFns[opts.sortMode];
    }
  }
  if (strategyCfg && opts.splitBias !== undefined) {
    strategyCfg.splitBias = opts.splitBias;
  }
  if (strategyCfg && opts.lookAheadOverride !== undefined) {
    strategyCfg.lookAhead = opts.lookAheadOverride;
  }
  if (strategyCfg && opts.scoreLayoutWeights !== undefined) {
    strategyCfg.scoreLayoutWeights = opts.scoreLayoutWeights;
  }
  if (strategyCfg && opts.zoneThreshold !== undefined) {
    strategyCfg.zoneThreshold = opts.zoneThreshold;
  }
  if (strategyCfg && opts.zonePenalty !== undefined) {
    strategyCfg.zonePenalty = opts.zonePenalty;
  }
  if (strategyCfg && opts.zoneSpanWeight !== undefined) {
    strategyCfg.zoneSpanWeight = opts.zoneSpanWeight;
  }
  if (strategyCfg && opts.adaptiveSplit !== undefined) {
    strategyCfg.adaptiveSplit = opts.adaptiveSplit;
  }

  // rotationMode da estratégia: 'fit-only' → só rotaciona se original não couber
  const effectiveRotation = strategyCfg?.rotationMode && opts.rotation !== false
    ? strategyCfg.rotationMode
    : rotation;

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
        espessura_mm: p.espessura_mm || 0,
        origem_id: p.origem_id
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
  const sortedSheets = [...sheetDescriptors].sort((a, b) => {
    const aa = (a.boundingWidth || a.width) * (a.boundingHeight || a.height);
    const bb = (b.boundingWidth || b.width) * (b.boundingHeight || b.height);
    return aa - bb;
  });

  const allSheets = [];
  let remaining = [...sorted];
  let totalUnplaced = 0;

  for (const grp of sortedSheets) {
    if (remaining.length === 0) break;

    // ── Filtro opcional por espessura ──────────────────────
    // Garante que peças de espessuras diferentes NÃO sejam colocadas na mesma chapa.
    // Quando chapa não tem espessura (grpEsp=0), infere da primeira peça disponível.
    if (opts.filterEspessura && remaining.length > 0) {
      const grpEsp = parseFloat(String(grp.espessura_mm != null ? grp.espessura_mm : opts.sheetEspessura).replace(',', '.')) || 0;
      const effectiveEsp = (grpEsp > 0) ? grpEsp : (parseFloat(remaining[0].espessura_mm) || 0);
      if (effectiveEsp > 0) {
        remaining = remaining.filter(p => {
          const pe = parseFloat(p.espessura_mm) || 0;
          return pe > 0 && Math.abs(pe - effectiveEsp) < 0.01;
        });
        if (remaining.length === 0) continue;
      }
    }

    // ── Filtro opcional por material ───────────────────────
    // Garante que peças de materiais diferentes NÃO sejam misturadas na mesma chapa.
    if (opts.filterMaterial && remaining.length > 0) {
      const grpMat = grp.material || opts.sheetMaterial || '';
      if (grpMat) {
        remaining = remaining.filter(p => p.material && p.material === grpMat);
        if (remaining.length === 0) continue;
      }
    }

    // NOVO: sheet descriptor retangular vs polígono
    const sheetW = grp.boundingWidth || grp.width;
    const sheetH = grp.boundingHeight || grp.height;
    const maxSheets = grp.count || 0;

    const effW = sheetW - 2 * bordaMm;
    const effH = sheetH - 2 * bordaMm;
    if (effW <= 0 || effH <= 0) continue;

    const sheetArea = effW * effH;
    const groupSheets = [];

    // NOVO: prepara freeRects/voidRects para polígono
    const grpFreeRects = grp.freeRects;
    const grpVoidRects = grp.voidRects || (grpFreeRects ? _calcVoidRects(grpFreeRects, effW, effH) : null);

    // ── Run MaxRects for this sheet group ──────────────────
    let _loopGuard = 0;

    // maxSheets = limite superior de chapas deste grupo.
    // NÃO reutilizar/reciclar peças para "encher" maxSheets.
    // maxSheets diz "não use mais que N", não "use exatamente N".
    // Quando peças acabam (remaining.length===0), PARA — as chapas
    // restantes do pool simplesmente não são usadas.
    while (maxSheets === 0 || groupSheets.length < maxSheets) {
      if (++_loopGuard > 10000) throw new Error('Infinite loop detected in sheet generation');
      if (remaining.length === 0) break;

      // ── Beam Search (quando beamWidth > 0) ────────────────
      const beamW = opts.beamWidth !== undefined && opts.beamWidth !== null
        ? opts.beamWidth
        : (strategyCfg?.beamWidth || 0);
      if (beamW > 0) {
        const beamResult = _beamNest(remaining, effW, effH, {
          margin, rotation, direcao, estrategia,
          beamWidth: beamW,
          tiers: opts.tiers,
          sortMode: opts.sortMode,
          splitBias: opts.splitBias,
          lookAheadOverride: opts.lookAheadOverride,
          zonaPct: opts.zonaPct,
          scoreLayoutWeights: strategyCfg?.scoreLayoutWeights,
          zoneThreshold: strategyCfg?.zoneThreshold,
          zonePenalty: strategyCfg?.zonePenalty,
          zoneSpanWeight: strategyCfg?.zoneSpanWeight,
          adaptiveSplit: strategyCfg?.adaptiveSplit,
          // NOVO: polígono
          freeRects: grpFreeRects,
          voidRects: grpVoidRects
        });

        if (beamResult.placed.length === 0) break;

        const usedArea = beamResult.placed.reduce((s, p) => s + p.area, 0);
        groupSheets.push({
          pieces: beamResult.placed,
          usedArea,
          utilization: Math.round((usedArea / sheetArea) * 10000) / 100,
          sheetWidth: sheetW,
          sheetHeight: sheetH
        });

        const stillRemaining = beamResult.stillRemaining;
        remaining.length = 0;
        remaining.push(...stillRemaining);
        continue;
      }

      const binOpts = {
        margin, direcao, estrategia,
        tiers: opts.tiers,
        sortMode: opts.sortMode,
        splitBias: opts.splitBias,
        lookAheadOverride: opts.lookAheadOverride,
        zonaPct: opts.zonaPct,
        scoreLayoutWeights: strategyCfg?.scoreLayoutWeights,
        zoneThreshold: strategyCfg?.zoneThreshold,
        zonePenalty: strategyCfg?.zonePenalty,
        zoneSpanWeight: strategyCfg?.zoneSpanWeight,
        adaptiveSplit: strategyCfg?.adaptiveSplit
      };
      // NOVO: polígono
      if (grpFreeRects) {
        binOpts.freeRects = grpFreeRects;
        binOpts.voidRects = grpVoidRects;
      }
      const bin = new MaxRectsBin(effW, effH, binOpts);
      const placed = [];
      const stillRemaining = [];

      for (let i = 0; i < remaining.length; i++) {
        const piece = remaining[i];
        const pos = bin.insert(piece.w, piece.h, {
          lookAhead,
          remaining: remaining.slice(i + 1),
          rotation: effectiveRotation
        });

        if (pos) {
          pos.label = piece.label;
          pos.material = piece.material || '';
          pos.espessura_mm = piece.espessura_mm || 0;
          pos.origem_id = piece.origem_id;
          pos.area = piece.w * piece.h;
          placed.push(pos);
        } else {
          stillRemaining.push(piece);
        }
      }

      // ── Gap-fill: tenta colocar peças restantes em espaços vazios ──
      // Após o loop principal, algumas peças podem não ter encaixado
      // por causa da ordenação (ex: peça grande bloqueou). Mas pode
      // haver free rects grandes o suficiente para as peças menores.
      // Ordena por área crescente (menores primeiro) e tenta colocar
      // em QUALQUER free rect disponível, sem look-ahead.
      if (stillRemaining.length > 0 && placed.length > 0) {
        const gapCandidates = [...stillRemaining].sort((a, b) => (a.w * a.h) - (b.w * b.h));
        const newStillRemaining = [];
        for (const piece of gapCandidates) {
          const pos = bin.insert(piece.w, piece.h, {
            lookAhead: 0,
            remaining: [],
            rotation: effectiveRotation
          });
          if (pos) {
            pos.label = piece.label;
            pos.material = piece.material || '';
            pos.espessura_mm = piece.espessura_mm || 0;
            pos.origem_id = piece.origem_id;
            pos.area = piece.w * piece.h;
            placed.push(pos);
          } else {
            newStillRemaining.push(piece);
          }
        }
        stillRemaining.length = 0;
        stillRemaining.push(...newStillRemaining);
      }

      if (placed.length === 0) break;

      // ── Pós-compactação: reduz Dimensão Distrib. ─────────
      // Move cada peça o máximo possível para a origem sem colidir,
      // eliminando gaps e tiras inúteis dentro do bbox.
      _compactLayout(placed, margin);

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

    // ════════════════════════════════════════════════════════
    //  Output model: collapsed + real qtd_copias
    //
    //  When repeticoes=1 identical layouts are DEDUPED into a
    //  single entry with `qtd_copias` reflecting total physical
    //  copies needed. When repeticoes=0 (default), each sheet
    //  is returned individually with qtd_copias=1.
    //
    //  `qtd_copias` means "this G-code program runs N times
    //  on N identical sheets." The caller is responsible for
    //  expanding downstream if needed.
    // ════════════════════════════════════════════════════════
    if (opts.repeticoes) {
      const fpMap = new Map();
      const deduped = [];
      for (const sheet of groupSheets) {
        const fp = sheet.pieces
          .slice()
          .sort((a, b) => a.x - b.x || a.y - b.y)
          .map(p => `${p.x},${p.y},${p.width},${p.height},${p.rotated?1:0},${p.label}`)
          .join('|');
        if (fpMap.has(fp)) {
          deduped[fpMap.get(fp)].qtd_copias++;
        } else {
          fpMap.set(fp, deduped.length);
          sheet.qtd_copias = 1;
          deduped.push(sheet);
        }
      }
      groupSheets.length = 0;
      groupSheets.push(...deduped);
    } else {
      for (const sheet of groupSheets) {
        sheet.qtd_copias = 1;
      }
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
      sheet.retalhos = _calcScrap(sheet.pieces, sheet.sheetWidth, sheet.sheetHeight, areaMinRetalho);
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
//  Scrap (waste) calculation
// ────────────────────────────────────────────────────────────

/**
 * Scan placed pieces and find rectangular gaps (scrap / waste).
 *
 * Divides the sheet into horizontal strips at each piece's top and bottom
 * edges, then finds empty runs within each strip.
 */
function _calcScrap(pieces, sheetW, sheetH, areaMin) {
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

// ═══════════════════════════════════════════════════════════════
//  Beam Search + Retalho-aware Scoring
// ═══════════════════════════════════════════════════════════════

/**
 * Score um layout parcial medindo a QUALIDADE DOS RETALHOS para
 * as peças restantes.
 *
 * Para cada free rect:
 *   1. Fit ratio: a maior peça restante que cabe ocupa % da área?
 *   2. Aspect fit: retalho estreito prefere peças estreitas
 *   3. BRS: maior freeRect contíguo
 *   4. Bbox compactness: densidade do bbox
 *
 * Retorna score normalizado (0..1).
 */
function _scoreLayout(bin, remaining, rotation) {
  const fr = bin.freeRects;
  const pl = bin.placed;
  if (fr.length === 0) return 0;

  // Bbox compactness
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pl) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x + p.width > maxX) maxX = p.x + p.width;
    if (p.y + p.height > maxY) maxY = p.y + p.height;
  }
  const bboxW = Math.max(1, maxX - minX);
  const bboxH = Math.max(1, maxY - minY);
  const bboxArea = bboxW * bboxH;
  const placedArea = pl.reduce((s, p) => s + p.width * p.height, 0);
  const compactness = bboxArea > 0 ? placedArea / bboxArea : 0;

  // Maior free rect (BRS)
  const largestFree = fr.reduce((max, r) => Math.max(max, r.w * r.h), 1);

  // Pontua cada free rect pela compatibilidade com peças restantes
  let fitScore = 0;
  const margin = bin.margin || 0;

  for (const rect of fr) {
    if (remaining.length === 0) break;

    // Encontra a peça restante que MELHOR se encaixa neste retalho
    let bestFit = 0;
    for (const p of remaining) {
      const rw = p.w + margin;
      const rh = p.h + margin;
      // Testa as duas orientações
      const fits = [];
      if (rw <= rect.w && rh <= rect.h) fits.push({ fw: rw, fh: rh, rot: false });
      if (rotation && rh <= rect.w && rw <= rect.h) fits.push({ fw: rh, fh: rw, rot: true });
      for (const f of fits) {
        // Fit ratio: quanto do retalho a peça preenche
        const areaFit = (f.fw * f.fh) / (rect.w * rect.h);
        // Aspect fit: quão compatível é o formato
        const rectAsp = Math.min(rect.w, rect.h) / Math.max(rect.w, rect.h);
        const pieceAsp = Math.min(f.fw, f.fh) / Math.max(f.fw, f.fh);
        const aspMatch = 1 - Math.abs(rectAsp - pieceAsp);
        // Score combinado: 70% area fit, 30% aspect match
        const score = areaFit * 0.7 + aspMatch * 0.3;
        if (score > bestFit) bestFit = score;
      }
    }
    fitScore += bestFit;
  }

  // Normaliza fitScore pelo número de free rects
  const avgFit = fr.length > 0 ? fitScore / fr.length : 0;

  // ── Zonas de trabalho (anti-espalhamento horizontal) ─────
  // Divide a chapa em N zonas ao longo do comprimento (X).
  // zonaPct (1-99): 1 = chapa toda (livre), 99 = máx. zoneamento.
  // Se zona anterior não está >80% cheia, peças em zonas
  // posteriores são penalizadas. Força preenchimento vertical
  // antes de espalhar horizontalmente.
  const zonaPct = bin._strategy?.zonaPct || 80; // default pós backtest

  // Skip zonas quando zonaPct <= 1 (estratégias direcionais puras)
  if (zonaPct > 1) {
    const numZones = Math.max(1, Math.min(99, Math.round(zonaPct)));
    // zoneW inteiro — evita loop infinito por floating point
    // (ex: 6000/9 = 666.666... → px nunca alcança pxEnd)
    const zoneW = Math.max(1, Math.floor(bin.binW / numZones));
    const zoneArea = bin.binH * zoneW;

    // Calcula área preenchida por zona
    const zoneFill = new Array(numZones).fill(0);
    for (const p of pl) {
      const z = Math.min(numZones - 1, Math.floor(p.x / zoneW));
      // Uma peça pode ocupar múltiplas zonas — distribui proporcionalmente
      const pxEnd = p.x + p.width;
      let px = p.x;
      while (px < pxEnd) {
        const zz = Math.min(numZones - 1, Math.floor(px / zoneW));
        const zzEnd = Math.min((zz + 1) * zoneW, pxEnd);
        const slice = (zzEnd - px) / p.width; // fração desta peça nesta zona
        zoneFill[zz] += p.width * p.height * slice;
        px = zzEnd;
      }
    }

    // Encontra a "fronteira" — primeira zona da esquerda com <threshold%
    const zThreshold = bin._strategy?.zoneThreshold ?? 0.8;
    let frontier = -1;
    for (let z = 0; z < numZones; z++) {
      const ratio = zoneArea > 0 ? zoneFill[z] / zoneArea : 0;
      if (ratio < zThreshold) {
        frontier = z;
        break;
      }
    }
    // Se todas ≥80%, não há penalidade
    if (frontier < 0) frontier = numZones - 1;

    // Penaliza peças além da fronteira
    let zonePenalty = 0;
    for (const p of pl) {
      const z = Math.min(numZones - 1, Math.floor(p.x / zoneW));
      if (z > frontier) {
        const dist = (z - frontier) / Math.max(1, numZones - frontier);
        zonePenalty += dist * (p.width * p.height) / Math.max(1, placedArea);
      }
    }
    // zonePenalty: 0 (perfeito) a ~1 (tudo além da fronteira)
    const zPenalty = bin._strategy?.zonePenalty ?? 0.5;
    let zoneFactor = Math.max(0, 1 - zonePenalty * zPenalty);

    // ── Span penalty: penaliza nº de zonas ocupadas ────────
    // Se o layout ocupa >50% da largura da chapa, sofre penalidade adicional.
    // Força distribuições mais compactas horizontalmente.
    const zSpanW = bin._strategy?.zoneSpanWeight ?? 0;
    if (zSpanW > 0 && numZones > 1) {
      const spanRatio = (frontier + 1) / numZones;
      const spanPenalty = Math.max(0, spanRatio - 0.5) * zSpanW;
      zoneFactor *= Math.max(0, 1 - spanPenalty);
    }

    // Score final: combina compactness, fit, BRS e zone factor
    const brsNorm = Math.min(1, largestFree / (bin.binW * bin.binH));
    const slw = bin._strategy?.scoreLayoutWeights || { compactness: 0.25, avgFit: 0.35, brsNorm: 0.15 };
    const rawScore = compactness * slw.compactness + avgFit * slw.avgFit + brsNorm * slw.brsNorm;
    return rawScore * zoneFactor;
  }

  // Sem zonas (zonaPct <= 1): score puro
  const brsNorm = Math.min(1, largestFree / (bin.binW * bin.binH));
  const slw = bin._strategy?.scoreLayoutWeights || { compactness: 0.25, avgFit: 0.35, brsNorm: 0.15 };
  return compactness * slw.compactness + avgFit * slw.avgFit + brsNorm * slw.brsNorm;
}

/**
 * Beam Search: para cada peça, testa todos (freeRect × orientação)
 * em TODOS os K caminhos simultâneos. Mantém os K melhores.
 *
 * @param {Array} beam - [{ bin, score }]
 * @param {object} piece - { w, h, label, material, espessura_mm }
 * @param {Array} remaining - Peças restantes (para look-ahead no scoring)
 * @param {number} K - Beam width
 * @param {boolean} rotation - Permitir rotação
 * @returns {Array} newBeam - [{ bin, score }] top-K
 */
function _beamInsert(beam, piece, remaining, K, rotation) {
  const candidates = [];

  for (const entry of beam) {
    const bin = entry.bin;
    const mw = piece.w + bin.margin;
    const mh = piece.h + bin.margin;

    // Enumera todos (freeRect × orientação)
    for (let i = 0; i < bin.freeRects.length; i++) {
      const fr = bin.freeRects[i];
      const opts = [];

      // Orientation A
      if (mw <= fr.w && mh <= fr.h) {
        opts.push({ px: fr.x, py: fr.y, pw: mw, ph: mh, rotated: false });
      }
      // Orientation B (rotated)
      if (rotation && mh <= fr.w && mw <= fr.h) {
        opts.push({ px: fr.x, py: fr.y, pw: mh, ph: mw, rotated: true });
      }

      for (const opt of opts) {
        const clone = bin.clone();
        // Place piece at candidate position
        const placedRect = {
          x: opt.px, y: opt.py,
          width: opt.rotated ? piece.h : piece.w,
          height: opt.rotated ? piece.w : piece.h,
          rotated: opt.rotated,
          label: piece.label || '',
          material: piece.material || '',
          espessura_mm: piece.espessura_mm || 0,
          origem_id: piece.origem_id,
          area: piece.w * piece.h
        };
        clone.placed.push(placedRect);
        clone._placedArea += placedRect.width * placedRect.height;
        clone._splitRect(i, opt.px, opt.py, opt.pw, opt.ph);

        // ── Clip free rects that overlap the newly placed piece ──
        // (mesmo clip do insert() — Beam Search pulava esta etapa)
        const cx = opt.px, cy = opt.py, cw = opt.pw, ch = opt.ph;
        for (let fi = clone.freeRects.length - 1; fi >= 0; fi--) {
          const fr = clone.freeRects[fi];
          if (fr.x >= cx + cw || fr.x + fr.w <= cx ||
              fr.y >= cy + ch || fr.y + fr.h <= cy) continue;
          const clipped = [];
          if (fr.x < cx) clipped.push({ x: fr.x, y: fr.y, w: cx - fr.x, h: fr.h });
          if (fr.x + fr.w > cx + cw) clipped.push({ x: cx + cw, y: fr.y, w: fr.x + fr.w - (cx + cw), h: fr.h });
          if (fr.y < cy) {
            const nx = Math.max(fr.x, cx);
            const nw = Math.min(fr.x + fr.w, cx + cw) - nx;
            if (nw > 0) clipped.push({ x: nx, y: fr.y, w: nw, h: cy - fr.y });
          }
          if (fr.y + fr.h > cy + ch) {
            const nx = Math.max(fr.x, cx);
            const nw = Math.min(fr.x + fr.w, cx + cw) - nx;
            if (nw > 0) clipped.push({ x: nx, y: cy + ch, w: nw, h: fr.y + fr.h - (cy + ch) });
          }
          clone.freeRects.splice(fi, 1);
          for (const c of clipped) {
            if (c.w > 0 && c.h > 0) clone.freeRects.push(c);
          }
        }

        clone._lastPx = opt.px;
        clone._lastPy = opt.py;
        if (opt.px < clone._bboxMinX) clone._bboxMinX = opt.px;
        if (opt.py < clone._bboxMinY) clone._bboxMinY = opt.py;
        const br = opt.px + opt.pw;
        const bb = opt.py + opt.ph;
        if (br > clone._bboxMaxX) clone._bboxMaxX = br;
        if (bb > clone._bboxMaxY) clone._bboxMaxY = bb;

        const score = _scoreLayout(clone, remaining, rotation);
        candidates.push({ bin: clone, score });
      }
    }
  }

  // Ordena decrescente e mantém top-K
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, K);
}

/**
 * Executa Beam Search para um grupo de peças em uma chapa.
 * Retorna { placed, stillRemaining }.
 */
function _beamNest(sortedPieces, sheetW, sheetH, opts) {
  const rotation = opts.rotation === 'fit-only' ? 'fit-only' : opts.rotation !== false;
  const K = opts.beamWidth !== undefined && opts.beamWidth !== null ? opts.beamWidth : 20;
  const margin = Math.max(0, opts.margin || 0);
  const direcao = opts.direcao || '';
  const estrategia = opts.estrategia != null ? opts.estrategia : -1;

  // Inicializa beam com 1 bin vazio
  const initialBin = new MaxRectsBin(sheetW, sheetH, {
    margin, direcao, estrategia,
    tiers: opts.tiers,
    sortMode: opts.sortMode,
    splitBias: opts.splitBias,
    lookAheadOverride: opts.lookAheadOverride,
    zonaPct: opts.zonaPct,
    scoreLayoutWeights: opts.scoreLayoutWeights,
    zoneThreshold: opts.zoneThreshold,
    zonePenalty: opts.zonePenalty,
    zoneSpanWeight: opts.zoneSpanWeight,
    adaptiveSplit: opts.adaptiveSplit,
    freeRects: opts.freeRects,
    voidRects: opts.voidRects
  });

  let beam = [{ bin: initialBin, score: 0 }];
  const stillRemaining = [];

  for (let pi = 0; pi < sortedPieces.length; pi++) {
    const piece = sortedPieces[pi];
    const remaining = sortedPieces.slice(pi + 1);

    const newBeam = _beamInsert(beam, piece, remaining, K, rotation);

    if (newBeam.length === 0) {
      // Peça não coube em nenhum caminho
      stillRemaining.push(piece);
    } else {
      beam = newBeam;
    }
  }

  // Retorna o melhor caminho
  const best = beam.reduce((a, b) => a.score > b.score ? a : b, beam[0]);
  // Compactação pós-posicionamento (como no greedy path)
  if (best && best.bin.placed.length > 0) {
    _compactLayout(best.bin.placed, margin);
  }
  return {
    placed: best ? best.bin.placed : [],
    stillRemaining
  };
}

module.exports = { MaxRectsBin, nest, _calcVoidRects };
