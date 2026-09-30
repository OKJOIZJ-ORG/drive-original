'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const compact = x => Array.isArray(x) ? {length:x.length, first:x[0]} : x;
for (const p of [
  'qa/candidate-rc28-delivery/results.json',
  'qa/candidate-rc27-delivery/product-integration.json',
  'qa/candidate-rc28-delivery/product-integration.json',
  'qa/rc28-corpus-content-continuity/provenance.json',
  'qa/rc28-corpus-content-continuity/local-verification.json',
  'qa/rc28-performance-preparation/provenance.json',
  'qa/rc27-28-pc-update-qualification/local-checks.json'
]) {
  const j = read(p);
  console.log(JSON.stringify({path:p, ...Object.fromEntries(Object.entries(j).map(([k,v])=>[k,compact(v)]))}));
}
for (const n of [27,28]) {
  const j=read(`qa/candidate-rc${n}-delivery/product-tests.json`);
  console.log(JSON.stringify({tests:n,counts:j.counts,stable:j.stable,passed:j.passed,args:j.args}));
}
