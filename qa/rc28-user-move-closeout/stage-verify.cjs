'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const git=args=>cp.execFileSync('git',args,{cwd:root,maxBuffer:4*1024*1024});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifestPath='qa/rc28-user-move-closeout/manifest.json';
const m=JSON.parse(fs.readFileSync(path.join(root,manifestPath),'utf8'));
assert(m.passed&&m.executionState==='WAIT-D067');
assert.equal(git(['diff','--cached','--name-only']).toString().trim(),'','Pre-existing staged changes');
for(const f of m.files) assert.equal(hash(fs.readFileSync(path.join(root,f.path))),f.sha256,f.path);
const files=[...m.files.map(f=>f.path),manifestPath];
git(['add','-f','--',...files]);
assert.deepEqual(git(['diff','--cached','--name-only']).toString().trim().split(/\r?\n/).sort(),files.filter(p=>git(['diff','--cached','--name-only','--',p]).length).sort());
let exact=0;
for(const f of m.files) if(f.path.startsWith('qa/')||f.path==='media/audio-codec-build.json') {
  assert.equal(hash(git(['show',`:${f.path}`])),f.sha256,`Index bytes ${f.path}`);exact++;
}
git(['diff','--cached','--check']);
console.log(JSON.stringify({stagedPaths:files.length,indexExactHashes:exact,whitespaceCheck:'PASS',state:'WAIT-D067'}));
