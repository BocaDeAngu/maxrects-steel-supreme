# Graph Report - maxrects-steel-supreme  (2026-07-13)

## Corpus Check
- 12 files · ~10,238 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 88 nodes · 110 edges · 8 communities (7 shown, 1 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `876d123f`
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

## God Nodes (most connected - your core abstractions)
1. `MaxRectsBin` - 10 edges
2. `nest()` - 7 edges
3. `keywords` - 6 edges
4. `_run()` - 5 edges
5. `maxrects-steel-supreme` - 5 edges
6. `Algorithm` - 5 edges
7. `main()` - 4 edges
8. `{ nest }` - 4 edges
9. `files` - 4 edges
10. `parseArgFlags()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `nest()`  [EXTRACTED]
  bin/cli.js → src/maxrects.js

## Import Cycles
- None detected.

## Communities (8 total, 1 thin omitted)

### Community 0 - "benchmark.js"
Cohesion: 0.13
Nodes (13): fs, { nest }, results, scenarios, { nest }, { nest }, r1, r2 (+5 more)

### Community 1 - "package.json"
Cohesion: 0.12
Nodes (16): bin, nest, description, keywords, license, main, name, repository (+8 more)

### Community 2 - "maxrects.js"
Cohesion: 0.18
Nodes (10): calcularRetalhos(), _callCache, _callKey(), _contains(), DEFAULT_TIERS, _estrategiaConfig(), nest(), _run() (+2 more)

### Community 3 - "Algorithm"
Cohesion: 0.15
Nodes (12): Algorithm, API, BRS (Best Remaining Space), CLI, input.json, Install, Look-ahead, maxrects-steel-supreme (+4 more)

### Community 4 - "cli.js"
Cohesion: 0.31
Nodes (8): args, fs, main(), { nest }, parseArgFlags(), parseSheet(), path, usage()

### Community 6 - "files"
Cohesion: 0.50
Nodes (4): files, bin/, index.js, src/

## Knowledge Gaps
- **44 isolated node(s):** `{ nest }`, `r1`, `r2`, `r3`, `r4` (+39 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MaxRectsBin` connect `MaxRectsBin` to `maxrects.js`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Why does `nest()` connect `maxrects.js` to `benchmark.js`, `cli.js`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **What connects `{ nest }`, `r1`, `r2` to the rest of the system?**
  _44 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `benchmark.js` be split into smaller, more focused modules?**
  _Cohesion score 0.13071895424836602 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._