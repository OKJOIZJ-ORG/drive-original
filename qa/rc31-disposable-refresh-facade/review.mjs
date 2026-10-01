import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const here=new URL('./',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('freeze.json',here)));
for(const [path,expected] of Object.entries(manifest.sha256))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL(path,here))).digest('hex'),expected,'FROZEN_BYTES: '+path);
assert.equal(manifest.binding.source,'4a484e6f839d2e6c3eb83503acb08147362cb011');
assert.equal(manifest.factorySHA256,'de300ac0103fd5928fc3c7550d4b9e8abe7a6718019d46abf9ea30a17b344e9b');
assert.equal(manifest.actualRun,false);
console.log(JSON.stringify({frozen:true,files:Object.keys(manifest.sha256).length,syntheticPassed:manifest.synthetic.passed,actualRun:false}));
