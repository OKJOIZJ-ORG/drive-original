const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const base=path.resolve(__dirname,'../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(base,p),'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(base,p))).digest('hex');
const owned=new Set();
function manifest(p){const m=read(p);for(const f of m.files){if(hash(f.path)!==f.sha256)throw Error('hash mismatch '+f.path);if(f.bytes!==undefined&&fs.statSync(path.join(base,f.path)).size!==f.bytes)throw Error('byte mismatch '+f.path);owned.add(f.path);}owned.add(p);}
manifest('qa/rc21-android-night/154-original-os-safe-stage-manifest.json');
owned.add('qa/rc21-android-night/154-curate-rc28-original-os-unit.cjs');
manifest('qa/rc28-finite-acceptance-matrix/staging-manifest.json');
manifest('qa/rc28-state-binding-readonly/staging-manifest.json');
const runner=read('qa/rc28-corpus-serial-runner/provenance.json');
if(hash('qa/rc28-corpus-serial-runner/runner.expression.js')!==runner.expressionSHA256||hash('qa/rc28-corpus-serial-runner/runner.function.js')!==runner.runnerFunctionSHA256)throw Error('runner mismatch');
for(const p of read('qa/rc28-corpus-serial-runner/curated-savepoint.json').exactOwnedFiles)owned.add(p);
for(const n of ['record-resume.cjs','save-force-proof.cjs','actual-force28.json','reopen-observer.expression.js','actual-reopen-and-cleanup.json','current-source-proof.json','README.md','modern-guidance-index.txt','derive-context.expression.js','record-progress.cjs','curate-savepoint.cjs'])owned.add('qa/rc28-resume-20261001/'+n);
for(const p of ['.gitattributes','memory/CHECKPOINT.md','memory/DECISIONS.md','memory/HANDOFF.md','memory/SESSION-LOG.md','memory/goal/commercial-player-stability.md','memory/checkpoints/20261001-0750-explicit-resume.md','memory/checkpoints/20261001-0830-live-corpus.md'])owned.add(p);
const paths=[...owned];
if(paths.some(p=>p.includes('private')||p.includes('..')))throw Error('unexpected private path');
cp.execFileSync('git',['add','-f','--',...paths],{cwd:base,stdio:'inherit'});
for(const p of paths.filter(p=>p.startsWith('qa/'))){const disk=hash(p);const index=cp.execFileSync('git',['show',':'+p],{cwd:base,maxBuffer:8*1024*1024});if(crypto.createHash('sha256').update(index).digest('hex')!==disk)throw Error('index byte mismatch '+p);}
console.log(JSON.stringify({exactPaths:paths.length,manifestHashesVerified:true,indexBytesVerified:true,privateExcluded:true}));
