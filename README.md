# maxrects-steel-supreme

MaxRects bin packing with **BRS** (Best Remaining Space) heuristic and **look-ahead**.

Zero dependencies. Pure JS. Works everywhere Node runs.

## Install

```bash
npm install maxrects-steel-supreme
```

Or from GitHub:

```bash
npm install github:BocaDeAngu/maxrects-steel-supreme
```

## API

```js
const { nest } = require('maxrects-steel-supreme');

const result = nest(
  [
    { w: 500, h: 300, label: 'chapa-A', quantity: 4, espessura_mm: 3 },
    { w: 200, h: 150, label: 'chapa-B', quantity: 8, espessura_mm: 3 },
  ],
  2000,       // sheet width (mm)
  1000,       // sheet height (mm)
  {
    margin: 10,          // gap between pieces (mm)
    lookAhead: 1,        // 0 = greedy, 1+ = look-ahead depth
    rotation: true,      // allow 90° rotation
    maxSheets: 0,        // 0 = unlimited
    borda_mm: 0,         // border deducted from each edge (mm)
    sentido: '',          // nesting direction: '' (auto), 'largura', 'comprimento'
    densidade: 0,        // material density g/cm³ (0=skip). Steel ≈ 7.85
    velocidadeCorte: 0,  // cutting constant mm²/min (0=skip)
    minDimensaoRetalho: 100, // min scrap dimension (mm); retalho se min(largura, altura) ≥ valor (0=skip)
    estrategia: 0,        // 0=Vertical, 1=Horizontal, 2=Supreme (overrides `direcao`)
    filterEspessura: 0,   // 1 = filter pieces by sheetEspessura (skip incompatible espessura)
    filterMaterial: 0,    // 1 = filter pieces by sheetMaterial (skip incompatible material)
    sheetEspessura: 0,    // sheet thickness (mm), used when filterEspessura=1
    sheetMaterial: ''     // sheet material, used when filterMaterial=1
  }
);
```

### Options

| Option | Default | Description |
|---|---|---|
| `rotation` | `true` | Allow 90° rotation |
| `sheetOrder` | `'asc-area'` | Multi-sheet group processing order: `'asc-area'` (smaller/cheapest first — minimizes total sheet area) or `'desc-area'` (consume large sheets first) |
| `margin` | `0` | Gap between pieces (mm) |
| `lookAhead` | `1` | Look-ahead depth (0 = greedy) |
| `maxSheets` | `0` | Max sheets for this sheet group (0 = unlimited). **Upper bound** — the algorithm stops as soon as pieces are exhausted (`remaining.length === 0`). It does NOT recycle pieces to fill all `maxSheets` sheets. |
| `borda_mm` | `0` | Border deducted from each sheet edge. Positions are offset by this value so they match the real sheet coordinates |
| `sentido` | `''` | Nesting direction preference. `'largura'` prioritizes horizontal rows (full-width strips). `'comprimento'` prioritizes vertical columns (full-height strips). Empty string = automatic |
| `densidade` | `0` | Material density in g/cm³. When set (e.g. `7.85` for steel), calculates `peso_kg` per piece and `peso_total_kg` in stats. Requires `espessura_mm` on each piece |
| `velocidadeCorte` | `0` | Cutting speed constant in mm²/min. Formula: `perim / (K / espessura)`. When set, calculates `tempo_corte_min` per piece and `perimetro_mm` |
| `minDimensaoRetalho` | `0` | Minimum useful dimension in mm (applies to BOTH width and height — axis does not matter). A free gap is reported as retalho only when `min(largura, altura) - margin ≥ valor`; below that it is perda. `0` = skip retalhos entirely |
| `estrategia` | `-1` (disabled) | Packing strategy: `0` = Vertical (single column), `1` = Horizontal (single row), `2` = Supreme (BRS + waste penalty + adaptive split, minimizes leftover). When set (0-2), overrides `direcao` and controls sort order, scoring tier weights, and split bias internally. `-1` = disabled — uses classic `direcao` mode for backward compatibility |
| `filterEspessura` | `0` | When `1`, keeps only pieces whose `espessura_mm` matches the sheet's `espessura_mm` (or `sheetEspessura`); pieces with `espessura_mm=0` (unspecified) are treated as incompatible. In multi-sheet mode, incompatible pieces are **deferred** (rejoin the pool for later groups), never discarded. Requires sheet to have `espessura_mm` (in multi-sheet mode) or `sheetEspessura` in opts (legacy single-sheet mode) |
| `filterMaterial` | `0` | When `1`, keeps only pieces whose `material` matches the sheet's `material`; pieces without `material` are treated as incompatible. In multi-sheet mode, incompatible pieces are **deferred** (rejoin the pool for later groups), never discarded. Requires sheet to have `material` (in multi-sheet mode) or `sheetMaterial` in opts (legacy single-sheet mode) |
| `sheetEspessura` | `0` | Sheet thickness in mm. Used as fallback when `filterEspessura=1` and the sheet descriptor has no `espessura_mm`. Also used directly in legacy single-sheet mode |
| `sheetMaterial` | `''` | Sheet material. Used as fallback when `filterMaterial=1` and the sheet descriptor has no `material`. Also used directly in legacy single-sheet mode |

### Result

Each sheet in `result.sheets` carries:
- `qtd_copias` — Número de cópias físicas que este layout representa. `1` para layout único, `1+N` quando N layouts idênticos foram colapsados (dedup interno). Veja o comment block em `src/maxrects.js`.

```json
{
  "sheets": [
    {
      "pieces": [
        { "x": 0, "y": 0, "width": 500, "height": 300, "rotated": false,
          "label": "chapa-A", "area": 150000,
          "espessura_mm": 3, "perimetro_mm": 1600,
          "peso_kg": 3.532, "tempo_corte_min": 0.27 }
      ],
      "usedArea": 150000,
      "utilization": 7.5,
      "sheetWidth": 2000,
      "sheetHeight": 1000,
      "qtd_copias": 1,
      "peso_total_kg": 3.532,
      "tempo_corte_min": 0.27,
      "retalhos": [{ "x": 500, "y": 0, "width": 1500, "height": 700, "area": 1050000 }]
    }
  ],
  "stats": {
    "totalSheets": 1,
    "totalPieces": 12,
    "totalArea": 840000,
    "avgUtilization": 42,
    "peso_total_kg": 42.384,
    "tempo_corte_total_min": 3.24,
    "retalhosAproveitaveis": 1
  },
  "unplaced": 0
}
```

## CLI

```bash
nest input.json -o resultado.json
nest --pieces pecas.json --sheet 2000x1000 --margin 10 --lookAhead 1
```

### input.json

```json
{
  "pieces": [
    { "w": 500, "h": 300, "quantity": 4 },
    { "w": 200, "h": 150, "quantity": 8 }
  ],
  "sheetW": 2000,
  "sheetH": 1000,
  "options": {
    "margin": 10,
    "lookAhead": 1
  }
}
```

## Algorithm

### MaxRects with adaptive split

When a piece is placed inside a free rectangle, the algorithm tests two split strategies
(vertical-first and horizontal-first) and picks the one that results in the least
fragmentation. After each placement, adjacent free rectangles are merged back together,
reversing fragmentation over time.

The **adaptive split** mode (enabled via `adaptiveSplit` in the strategy config) adds a
heuristic inspired by [Jim Scott's binary-tree lightmap packer](https://blackpawn.com/texts/lightmaps/default.html):
when a piece fills the free rectangle disproportionately in one dimension,
the split direction is biased to leave a more usable leftover — wide pieces
trigger a horizontal-first split (stacking in Y), tall pieces trigger a vertical-first
split (extending in X).

> **Credit:** Adaptive split heuristic based on the binary-tree packing approach described
> by Jim Scott at [blackpawn.com/texts/lightmaps/default.html](https://blackpawn.com/texts/lightmaps/default.html).
> Email: `jimscott@blackpawn.com`

### BRS (Best Remaining Space)

For each candidate placement, simulates the split and scores by the **area of the
largest remaining free rectangle**. Higher score = preserves more large contiguous space
for future pieces.

### Look-ahead

After scoring each candidate by BRS, checks whether the *next* piece fits in the
resulting free rectangles. Adds a bonus when it does, so the algorithm prefers
placements that accommodate upcoming pieces — even if the immediate BRS score is
slightly lower.

### Merge

After each placement, adjacent free rectangles with the same y/height or x/width
are merged back together, reversing fragmentation over time.

---

## Full Parameter Reference

### Common opts (`nest(pieces, sheetW, sheetH, opts)`)

All parameters below are optional unless marked as required.

| Opt | Type | Default | Description |
|-----|------|---------|-------------|
| `rotation` | `boolean` | `true` | Allow 90° rotation |
| `sheetOrder` | `string` | `'asc-area'` | Multi-sheet group processing order: `'asc-area'` (smaller/cheapest first — minimizes total sheet area) or `'desc-area'` (consume large sheets first) |
| `margin` | `number` | `0` | Gap between pieces (mm) |
| `borda_mm` | `number` | `0` | Border deducted from each sheet edge (mm) |
| `lookAhead` | `number` | `strategyCfg.lookAhead ?? 1` | Look-ahead depth (0 = greedy). Overrides strategy default |
| `lookAheadOverride` | `number` | `undefined` | Alternative override path for look-ahead (used by Beam Search internally) |
| `maxSheets` | `number` | `0` | Max sheets (0 = unlimited). Upper bound — stops when pieces exhausted |
| `direcao` | `string` | `''` | Nesting sense: `'vertical'` / `'horizontal'` / `''`. Overridden when `estrategia >= 0` |
| `estrategia` | `number` | `-1` | Packing strategy: `0`=Vertical, `1`=Horizontal, `2`=Supreme. Overrides `direcao` and controls sort, tiers, split bias internally. `-1` = disabled (classic direcao fallback) |
| `sortMode` | `string` | `undefined` | Sort override: `'area-desc'` / `'width-desc'` / `'height-desc'`. Replaces the strategy's default sort |
| `splitBias` | `number` | `undefined` | Override split bias (0-100). Strategy defaults: 40 (Vertical), 60 (Horizontal), 38 (Supreme) |
| `tiers` | `object` | `undefined` | **Full tier override.** Pass `{ tier2: { weight, mode }, tier3: ... }` to replace the strategy's tier configuration entirely |
| `zonaPct` | `number` | `strategyCfg.zonaPct ?? 1` | Zone policy (0 = off, >0 = on). Supreme consumes the current Y column before opening a new X column. Strategy default: 1 for Vertical, Horizontal, and Supreme |
| `beamWidth` | `number` | `0` (disabled) | Beam Search width. When > 0, activates `_beamNest` tree search instead of the greedy loop |
| `repeticoes` | `boolean` | `undefined` | When truthy, deduplicates identical sheet layouts and collapses them into `qtd_copias` |
| `densidade` | `number` | `0` | Material density g/cm³ (e.g. 7.85 for steel). If > 0, calculates `peso_kg` per piece |
| `velocidadeCorte` | `number` | `0` | Cutting constant mm²/min. If > 0, calculates `tempo_corte_min = perim / (K / esp)` |
| `minDimensaoRetalho` | `number` | `0` | Minimum useful dimension (mm) for retalho. Gap vira retalho só se `min(largura, altura) - margin ≥ valor`. `0` = skip retalhos |
| `filterEspessura` | `number` | `0` | When `1`, keeps only pieces whose `espessura_mm` matches the sheet's; `espessura_mm=0` treated as incompatible. Multi-sheet: incompatible pieces deferred, never discarded |
| `filterMaterial` | `number` | `0` | When `1`, keeps only pieces whose `material` matches the sheet's; pieces without `material` treated as incompatible. Multi-sheet: incompatible pieces deferred, never discarded |
| `sheetEspessura` | `number` | `0` | Fallback sheet thickness when sheet descriptor has no `espessura_mm` |
| `sheetMaterial` | `string` | `''` | Fallback sheet material when sheet descriptor has no `material` |

### Multi-sheet descriptors

When calling `nest(pieces, sheets, opts)`, sheets are processed in **area-ascending order** (smallest/cheapest first) by default — the greedy that minimizes total sheet area/cost. Pieces allocated to an earlier group are removed from later ones. Pieces that don't match a group's espessura/material filter are deferred, not lost. Override with `opts.sheetOrder: 'desc-area'` to consume large sheets first.

Each sheet descriptor supports:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `width` | `number` | required | Sheet width (mm) |
| `height` | `number` | required | Sheet height (mm) |
| `count` | `number` | `0` | Max copies for this sheet size (0 = unlimited) |
| `espessura_mm` | `number` | `opts.sheetEspessura` | Sheet thickness — used by filter |
| `material` | `string` | `opts.sheetMaterial` | Sheet material — used by filter |

### Piece properties (`pieces[]`)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `w` | `number` | required | Piece width (mm) |
| `h` | `number` | required | Piece height (mm) |
| `quantity` | `number` | `1` | Quantity (expanded to individual pieces) |
| `label` | `string` | `''` | Display label (carried through to result) |
| `material` | `string` | `''` | Material name — used by `filterMaterial` |
| `espessura_mm` | `number` | `0` | Thickness (mm) — used by weight/time calc and `filterEspessura` |

---

### Strategy configuration (`_strategyConfig`)

Each `estrategia` (0/1/2) has a built-in config. Every field can be overridden via the `opts` above.

#### Defaults per strategy

| Field | Vertical (0) | Horizontal (1) | Supreme (2) |
|-------|-------------|----------------|---------------|
| `direcao` | `'vertical'` | `'horizontal'` | `''` (none) |
| sort order | width-desc | height-desc | area-desc |
| `lookAhead` | **0** | **0** | **3** |
| `splitBias` | 40 | 60 | 50 |
| `zonaPct` | 1 (beam-only) | 1 (beam-only) | 1 (active, Y-first) |
| `rotationMode` | **`'fit-only'`** | **`'fit-only'`** | — (normal) |
| **tier2** | **direcao × 1.0** | **direcao × 1.0** | baf × 1.0 |
| **tier4** | 0 | 0 | 1.5 |
| **tier5** | 0 | 0 | 4.0 |
| others | 0 (off) | 0 (off) | 0 (off) |

#### How direction works

| Strategy | Scoring | Effect |
|----------|---------|--------|
| Vertical (0) | `cand.py × binArea / binH` | Higher Y = better → prefers BOTTOM rect → columns consume Y |
| Horizontal (1) | `cand.px × binArea / binW` | Higher X = better → prefers RIGHT rect → rows consume X |
| Supreme (2) | BAF + adaptive split + zoning | Minimizes leftover, near-square blocks with adaptive split |

**Vertical and Horizontal** use pure position-based scoring (`mode: 'direcao'`) with `rotationMode: 'fit-only'` — no BRS, no waste penalty, no squareness, no look-ahead. The score simply rewards placements that consume the target axis. Rotation only occurs when the original orientation doesn't fit in any free rect — never for scoring advantage. This gives clear directional layouts without unnecessary rotation.

**Supreme** is the advanced strategy: uses BAF for piece-to-space fit, adaptive split (threshold 0.5, inspired by the binary-tree lightmap packer), active Y-first zoning (`zonaPct=1`) and Beam Search (beamWidth=35) for compact rectangular blocks. It fills the current Y column whenever the next piece fits there, then opens a new column in X.

---

### Hardcoded constants (not configurable without editing the source)

#### Scoring (`_scoreCandidate`)

| Constant | Location | Value | Purpose |
|----------|----------|-------|---------|
| Tier 1 multiplier | `_scoreCandidate` | `binArea × 2` per future-fit | Look-ahead bonus (fixed, not a weight) |
| Tier 4 divisor | `_scoreCandidate` | `candArea × 10` | Ratio base for waste penalty |
| Anti-gap threshold | `_scoreCandidate` | `0.25` | Aspect < 1:4 = "strip" |
| Strip penalty | `_scoreCandidate` | `0.25` × stripCount | Each strip reduces square bonus 25% |
| Rotation penalty (square mode) | `_scoreCandidate` | `binArea × 0.08` | Penalty when rotating in aligned batch |
| Alignment bonus (square mode) | `_scoreCandidate` | `binArea × 0.5` | Bonus for same-dimension piece on expected axis |
| Fallback split bias (no strategy) | `_scoreCandidate` | `5` | Classic 5× bias for direction when `estrategia=-1` |

#### Beam Search (`_scoreLayout`)

| Constant | Value | Purpose |
|----------|-------|---------|
| Default `beamWidth` | `20` | Top-K candidates kept |
| Fit × Aspect ratio | `0.7 × 0.3` | Weighting within per-candidate score |
| Zone full threshold | `0.8` (80%) | Zone is "full" |
| Max zone penalty | `0.5` (50% reduction) | Worst-case zoning penalty |
| Final score (compactness) | `0.25` | |
| Final score (avgFit) | `0.35` | |
| Final score (brsNorm) | `0.15` | |

#### Misc

| Constant | Value | Context |
|----------|-------|---------|
| Compact step array | `[16, 8, 5, 1]` | Coarse-to-fine slide steps (mm) |
| Loop guard max | `10000` | Max sheet-generation iterations |
| Strip minimum | `1` mm | Ignore retalho strips < 1mm |
| Gap tolerance | `1` mm | Retalho gap detection |
| Precision | `0.1` mm | Retalho coordinate rounding |
| Espessura tolerance | `0.01` mm | Material filter matching

## Publicação (npm)

Pacote público e gratuito (MIT). Publicar nova versão:

1. Bump da versão em `package.json` — versões são **imutáveis** no npm, nunca republicar a mesma versão
2. `npm publish` (login + 2FA)
3. Conferir: `npm view maxrects-steel-supreme version`

Consumido pelo produto CorteMES via `npm update maxrects-steel-supreme` no piloto + build da imagem docker.
