# Graph Report - maxrects-steel-supreme  (2026-08-19)

## Corpus Check
- 21 files · ~23,235 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 160 nodes · 205 edges · 11 communities
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6530d476`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- benchmark.js
- package.json
- maxrects.js
- Algorithm
- cli.js
- MaxRectsBin
- files
- nest
- keywords
- estrategia.test.js

## God Nodes (most connected - your core abstractions)
1. `MaxRectsBin` - 10 edges
2. `_run()` - 10 edges
3. `_beamInsert()` - 8 edges
4. `assertNoOverlap()` - 8 edges
5. `nest()` - 7 edges
6. `maxrects-steel-supreme` - 7 edges
7. `keywords` - 6 edges
8. `Full Parameter Reference` - 6 edges
9. `_beamNest()` - 5 edges
10. `Algorithm` - 5 edges

## Surprising Connections (you probably didn't know these)
- `caso()` --calls--> `nest()`  [EXTRACTED]
  _confirm_bug_scrap.js → src/maxrects.js
- `main()` --calls--> `nest()`  [EXTRACTED]
  bin/cli.js → src/maxrects.js

## Import Cycles
- None detected.

## Communities (11 total, 0 thin omitted)

### Community 0 - "benchmark.js"
Cohesion: 0.13
Nodes (13): fs, { nest }, results, scenarios, { nest }, { nest }, r1, r2 (+5 more)

### Community 1 - "package.json"
Cohesion: 0.10
Nodes (20): bin, nest, description, files, keywords, license, main, name (+12 more)

### Community 2 - "maxrects.js"
Cohesion: 0.08
Nodes (23): assert, { assertNoOverlap, pecas }, { nest }, path, assert, { assertNoOverlap, pecas }, { nest }, path (+15 more)

### Community 3 - "Algorithm"
Cohesion: 0.14
Nodes (13): Algorithm, API, BRS (Best Remaining Space), CLI, input.json, Install, Look-ahead, maxrects-steel-supreme (+5 more)

### Community 4 - "cli.js"
Cohesion: 0.20
Nodes (12): args, fs, main(), { nest }, parseArgFlags(), parseSheet(), path, usage() (+4 more)

### Community 5 - "MaxRectsBin"
Cohesion: 0.15
Nodes (18): _beamInsert(), _beamNest(), _calcScrap(), _calcVoidRects(), _compactLayout(), _computeHStar(), _contains(), DEFAULT_TIERS (+10 more)

### Community 6 - "files"
Cohesion: 0.18
Nodes (11): Beam Search (`_scoreLayout`), Common opts (`nest(pieces, sheetW, sheetH, opts)`), Defaults per strategy, Full Parameter Reference, Hardcoded constants (not configurable without editing the source), How direction works, Misc, Multi-sheet descriptors (+3 more)

### Community 8 - "nest"
Cohesion: 0.29
Nodes (4): assert, { assertNoOverlap }, { nest }, path

### Community 9 - "keywords"
Cohesion: 0.33
Nodes (4): assert, { assertNoOverlap }, { nest }, path

### Community 10 - "estrategia.test.js"
Cohesion: 0.33
Nodes (5): assert, files, fs, path, results

## Knowledge Gaps
- **87 isolated node(s):** `{ nest }`, `r0`, `{ nest }`, `r1`, `r2` (+82 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `assertNoOverlap()` connect `maxrects.js` to `nest`, `keywords`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `nest()` connect `cli.js` to `benchmark.js`, `MaxRectsBin`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `{ nest }`, `r0`, `{ nest }` to the rest of the system?**
  _87 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `benchmark.js` be split into smaller, more focused modules?**
  _Cohesion score 0.13071895424836602 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `maxrects.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07956989247311828 - nodes in this community are weakly interconnected._
- **Should `Algorithm` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._