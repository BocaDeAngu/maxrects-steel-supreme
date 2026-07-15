# Graph Report - maxrects-steel-supreme  (2026-07-15)

## Corpus Check
- 14 files · ~19,795 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 117 nodes · 154 edges · 11 communities (10 shown, 1 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0fe77b19`
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
1. `MaxRectsBin` - 13 edges
2. `nest()` - 9 edges
3. `_run()` - 7 edges
4. `keywords` - 6 edges
5. `maxrects-steel-supreme` - 6 edges
6. `Full Parameter Reference` - 6 edges
7. `_beamInsert()` - 5 edges
8. `run()` - 5 edges
9. `Algorithm` - 5 edges
10. `main()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `nest()`  [EXTRACTED]
  bin/cli.js → src/maxrects.js
- `run()` --calls--> `nest()`  [EXTRACTED]
  test/validate-layout.mjs → src/maxrects.js

## Import Cycles
- None detected.

## Communities (11 total, 1 thin omitted)

### Community 0 - "benchmark.js"
Cohesion: 0.13
Nodes (13): fs, { nest }, results, scenarios, { nest }, { nest }, r1, r2 (+5 more)

### Community 1 - "package.json"
Cohesion: 0.13
Nodes (14): bin, nest, description, files, license, main, name, repository (+6 more)

### Community 3 - "Algorithm"
Cohesion: 0.15
Nodes (12): Algorithm, API, BRS (Best Remaining Space), CLI, input.json, Install, Look-ahead, maxrects-steel-supreme (+4 more)

### Community 4 - "cli.js"
Cohesion: 0.31
Nodes (8): args, fs, main(), { nest }, parseArgFlags(), parseSheet(), path, usage()

### Community 5 - "MaxRectsBin"
Cohesion: 0.18
Nodes (11): _beamInsert(), _beamNest(), _calcScrap(), _contains(), DEFAULT_TIERS, MaxRectsBin, _rectCollides(), _rectOverlapsAny() (+3 more)

### Community 6 - "files"
Cohesion: 0.18
Nodes (11): Beam Search (`_scoreLayout`), Common opts (`nest(pieces, sheetW, sheetH, opts)`), Defaults per strategy, Full Parameter Reference, Hardcoded constants (not configurable without editing the source), How direction works, Misc, Multi-sheet descriptors (+3 more)

### Community 8 - "nest"
Cohesion: 0.39
Nodes (7): nest(), bbox(), OUT_DIR, overlaps(), renderSVG(), run(), SCENARIOS

### Community 9 - "keywords"
Cohesion: 0.33
Nodes (6): keywords, bin-packing, maxrects, nesting, sheet-cutting, steel

### Community 10 - "estrategia.test.js"
Cohesion: 0.40
Nodes (3): assert, assertNoOverlap(), { MaxRectsBin, nest }

## Knowledge Gaps
- **54 isolated node(s):** `{ nest }`, `r1`, `r2`, `r3`, `r4` (+49 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `nest()` connect `nest` to `benchmark.js`, `maxrects.js`, `cli.js`, `MaxRectsBin`, `estrategia.test.js`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Why does `MaxRectsBin` connect `MaxRectsBin` to `estrategia.test.js`, `maxrects.js`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `maxrects-steel-supreme` connect `Algorithm` to `files`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **What connects `{ nest }`, `r1`, `r2` to the rest of the system?**
  _54 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `benchmark.js` be split into smaller, more focused modules?**
  _Cohesion score 0.13071895424836602 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._