// Runner caseiro — sem framework, sem npm script.
// Uso: node test/run.js [arquivo1.test.js ...]  (padrão: todos os *.test.js de test/)
// Saída: "N tests: X passed, Y failed" + process.exit(1) em falha.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const results = { passed: 0, failed: 0, failures: [] };

globalThis.test = (name, fn) => {
  try {
    fn(assert);
    results.passed++;
  } catch (e) {
    results.failed++;
    results.failures.push({ name, error: e });
  }
};

const dir = __dirname;
let files = process.argv.slice(2);
if (files.length === 0) {
  files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).map(f => path.join(dir, f));
} else {
  files = files.map(f => path.resolve(dir, f));
}

for (const f of files) {
  require(f);
}

const total = results.passed + results.failed;
console.log(`${total} tests: ${results.passed} passed, ${results.failed} failed`);
for (const { name, error } of results.failures) {
  console.error(`\nFAIL: ${name}\n${error && error.stack ? error.stack : error}`);
}
if (results.failed > 0) process.exit(1);
