#!/usr/bin/env node

/**
 * CLI for maxrects-steel-supreme.
 *
 * Usage:
 *   nest input.json -o output.json
 *   nest --pieces pieces.json --sheet 2000x1000 --margin 10
 *
 * Input JSON format (same as the API):
 *   { "pieces": [{ "w": 500, "h": 300, "label": "peca1", "quantity": 2 }],
 *     "sheetW": 2000, "sheetH": 1000,
 *     "options": { "margin": 10, "lookAhead": 1, "rotation": true, "maxSheets": 0 } }
 */

const { nest } = require('../src/maxrects');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

function usage() {
  console.error(`
Usage:
  nest <input.json>                        Output to stdout
  nest <input.json> -o <output.json>       Output to file
  nest --pieces <file> --sheet WxH [opts]

Options (can be in input.json or CLI):
  --margin N        Gap between pieces (mm, default 0)
  --lookAhead N     Look-ahead depth (default 1, 0=greedy)
  --rotation on|off Allow rotation (default on)
  --maxSheets N     Max sheets, 0=unlimited (default 0)
  -o <file>         Output file path
`);
  process.exit(1);
}

function parseSheet(s) {
  const m = s.match(/^(\d+)\s*x\s*(\d+)$/i);
  if (!m) throw new Error(`Invalid sheet format: "${s}". Use WxH e.g. 2000x1000`);
  return [parseFloat(m[1]), parseFloat(m[2])];
}

function parseArgFlags(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-o': opts.output = args[++i]; break;
      case '--pieces': opts.piecesFile = args[++i]; break;
      case '--sheet': {
        const [w, h] = parseSheet(args[++i]);
        opts.sheetW = w; opts.sheetH = h;
        break;
      }
      case '--margin': opts.margin = parseFloat(args[++i]); break;
      case '--lookAhead': opts.lookAhead = parseInt(args[++i], 10); break;
      case '--rotation': opts.rotation = args[++i] !== 'off'; break;
      case '--maxSheets': opts.maxSheets = parseInt(args[++i], 10); break;
    }
  }
  return opts;
}

function main() {
  const flags = parseArgFlags(args);

  // Determine input source
  let input;

  if (flags.piecesFile) {
    // pieces file + sheet required
    if (!flags.sheetW || !flags.sheetH) {
      console.error('Error: --sheet WxH is required with --pieces');
      usage();
    }
    const piecesRaw = JSON.parse(fs.readFileSync(flags.piecesFile, 'utf-8'));
    input = {
      pieces: Array.isArray(piecesRaw) ? piecesRaw : piecesRaw.pieces,
      sheetW: flags.sheetW,
      sheetH: flags.sheetH,
      options: {
        margin: flags.margin,
        lookAhead: flags.lookAhead,
        rotation: flags.rotation,
        maxSheets: flags.maxSheets
      }
    };
  } else {
    // JSON file (first positional arg)
    const inputFile = args.find(a => !a.startsWith('-'));
    if (!inputFile) usage();
    input = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
    // CLI flags override JSON options
    if (flags.margin !== undefined) input.options = input.options || {};
    if (flags.margin !== undefined) input.options.margin = flags.margin;
    if (flags.lookAhead !== undefined) { input.options = input.options || {}; input.options.lookAhead = flags.lookAhead; }
    if (flags.rotation !== undefined) { input.options = input.options || {}; input.options.rotation = flags.rotation; }
    if (flags.maxSheets !== undefined) { input.options = input.options || {}; input.options.maxSheets = flags.maxSheets; }
  }

  // Normalize pieces with quantity expansion
  const pieces = [];
  for (const p of (input.pieces || [])) {
    const qty = Math.max(1, p.quantity || 1);
    for (let i = 0; i < qty; i++) {
      pieces.push({ w: Number(p.w), h: Number(p.h), label: p.label || '' });
    }
  }

  const result = nest(pieces, input.sheetW, input.sheetH, input.options || {});
  const output = JSON.stringify(result, null, 2);

  if (flags.output) {
    fs.writeFileSync(flags.output, output, 'utf-8');
    console.error(`Wrote ${flags.output}`);
  } else {
    console.log(output);
  }
}

if (require.main === module) main();
