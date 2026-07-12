const { nest } = require('./index');

console.log('C1 (poucas pecas):');
const r1 = nest([{w:200,h:100,quantity:17,label:'P'}], 1210, 6000, {rotation:true, margin:10, borda_mm:10, maxSheets:100, repeticoes:1});
console.log('  unique=' + r1.sheets.length + ' vc=[' + r1.sheets.map(s=>s.vezes_cortada).join() + ']');

console.log('C2 (50 identicas, maxSheets=10):');
const r2 = nest([{w:200,h:100,quantity:50,label:'A'}], 1210, 6000, {rotation:true, margin:10, borda_mm:10, maxSheets:10, repeticoes:1});
console.log('  unique=' + r2.sheets.length + ' vc=[' + r2.sheets.map(s=>s.vezes_cortada).join() + '] total=' + r2.sheets.reduce((s,sh)=>s+sh.vezes_cortada, 0));

console.log('C3 (200 identicas 1000x500):');
const r3 = nest([{w:200,h:100,quantity:200,label:'B'}], 1000, 500, {rotation:true, margin:5, maxSheets:10, repeticoes:1});
console.log('  unique=' + r3.sheets.length + ' vc=[' + r3.sheets.map(s=>s.vezes_cortada).join() + '] total=' + r3.sheets.reduce((s,sh)=>s+sh.vezes_cortada, 0));

console.log('C4 (mistas):');
const r4 = nest([{w:500,h:300,quantity:8,label:'G'},{w:400,h:250,quantity:12,label:'M'},{w:300,h:150,quantity:20,label:'P'},{w:200,h:100,quantity:30,label:'X'}], 1210, 6000, {rotation:true, margin:10, borda_mm:10, maxSheets:10, repeticoes:1});
console.log('  unique=' + r4.sheets.length + ' vc=[' + r4.sheets.map(s=>s.vezes_cortada).join() + '] total=' + r4.sheets.reduce((s,sh)=>s+sh.vezes_cortada, 0));

console.log('OK');
