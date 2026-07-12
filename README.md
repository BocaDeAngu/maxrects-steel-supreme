# maxrects-steel-supreme

MaxRects bin packing with **BRS** (Best Remaining Space) heuristic and **look-ahead**.

Zero dependencies. Pure JS. Works everywhere Node runs.

## Install

```bash
npm install maxrects-steel-supreme
```

Or from GitHub:

```bash
npm install github:user/maxrects-steel-supreme
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
    areaMinRetalho: 0,   // min waste area mm² (0=skip retalhos)
    repeticoes: 0,        // 0 = each sheet returned individually. 1 = collapse identical layouts
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
| `margin` | `0` | Gap between pieces (mm) |
| `lookAhead` | `1` | Look-ahead depth (0 = greedy) |
| `maxSheets` | `0` | Max sheets (0 = unlimited) |
| `borda_mm` | `0` | Border deducted from each sheet edge. Positions are offset by this value so they match the real sheet coordinates |
| `sentido` | `''` | Nesting direction preference. `'largura'` prioritizes horizontal rows (full-width strips). `'comprimento'` prioritizes vertical columns (full-height strips). Empty string = automatic |
| `densidade` | `0` | Material density in g/cm³. When set (e.g. `7.85` for steel), calculates `peso_kg` per piece and `peso_total_kg` in stats. Requires `espessura_mm` on each piece |
| `velocidadeCorte` | `0` | Cutting speed constant in mm²/min. Formula: `perim / (K / espessura)`. When set, calculates `tempo_corte_min` per piece and `perimetro_mm` |
| `areaMinRetalho` | `0` | Minimum area in mm² for a waste rectangle to be reported. When set, generates `retalhos[]` per sheet |
| `repeticoes` | `0` | Repetition mode. `0` = each sheet is returned individually (default). `1` = collapse identical layouts into one entry with `vezes_cortada` counting how many physical copies that layout represents. When `repeticoes=1`, the `sheets` array shrinks but each sheet carries `vezes_cortada` with the repetition count. The `totalSheets` stat reflects unique layouts, not physical copies |
| `filterEspessura` | `0` | When `1`, filters out pieces whose `espessura_mm` does not match the sheet's `espessura_mm` (or `sheetEspessura`). Pieces with `espessura_mm=0` (unspecified) pass through. Requires sheet to have `espessura_mm` (in multi-sheet mode) or `sheetEspessura` in opts (legacy single-sheet mode) |
| `filterMaterial` | `0` | When `1`, filters out pieces whose `material` does not match the sheet's `material`. Pieces without `material` pass through. Requires sheet to have `material` (in multi-sheet mode) or `sheetMaterial` in opts (legacy single-sheet mode) |
| `sheetEspessura` | `0` | Sheet thickness in mm. Used as fallback when `filterEspessura=1` and the sheet descriptor has no `espessura_mm`. Also used directly in legacy single-sheet mode |
| `sheetMaterial` | `''` | Sheet material. Used as fallback when `filterMaterial=1` and the sheet descriptor has no `material`. Also used directly in legacy single-sheet mode |

### Result

Each sheet in `result.sheets` carries:
- `vezes_cortada` — How many physical copies this layout represents (always `1` when `repeticoes=0`, can be >1 when `repeticoes=1` and identical layouts were generated)

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
      "vezes_cortada": 1,
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
