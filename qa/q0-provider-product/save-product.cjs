'use strict';
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const git=args=>execFileSync('git',args,{cwd:root,maxBuffer:4*1024*1024,encoding:'utf8'});
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const record=JSON.parse(fs.readFileSync(path.join(__dirname,'full-product-rc14.json'),'utf8'));
if(!record.passed||!record.sourceUnchanged||record.version!=='1.22.0-rc.14'||record.tests!==452)throw Error('Verified rc.14 record required');
for(const [file,expected]of Object.entries(record.hashes))if(hash(fs.readFileSync(path.join(root,file)))!==expected)throw Error(`Changed verified producer: ${file}`);
const roots=['.gitattributes','app.js','sw.js','index.html','version.json','media/revision-pin.js',
  'scripts/public-files.cjs','scripts/materialize-committed-pages.cjs',
  'tests/app.test.js','tests/sw.test.js','tests/shell.test.js','tests/static.test.js','tests/q0-proxy.test.js','tests/revision-pin.test.js',
  'memory/00-INDEX.md','memory/SESSION-LOG.md','memory/PRODUCT-TRUTH.md','memory/CHECKPOINT.md',
  'memory/goal/commercial-player-stability.md','memory/Q0-PRODUCT-20260929.md',
  'memory/checkpoints/20260929-0558-q0-product-review.md','memory/checkpoints/20260929-0614-q0-local-verified.md'];
const qa=['README.md','native-audit.cjs','native-results.json','native-results-initial.json',
  'native-results-node.json','native-results-node-rc13.json','native-results-node-attempt-1.json','native-results-node-attempt-2.json',
  'native-results-resource-key-attempt-1.json','native-results-manifest.json','native-results-manifest-rc13.json',
  'fullcheck.cjs','full-product-rc14.json','full-product-rc14.log','cut-rc14.cjs',
  'normalize-owned-producers.cjs','shell-test.producer.js','save-product.cjs'].map(file=>`qa/q0-provider-product/${file}`);
for(const file of [...roots,...qa]){
  const absolute=path.resolve(root,file),stat=fs.lstatSync(absolute);
  if(!absolute.startsWith(root+path.sep)||!stat.isFile()||stat.isSymbolicLink())throw Error('Unsafe stage target');
}
git(['add','--',...roots]);
for(const file of qa)git(['add','-f','--',file]);
fs.writeFileSync(path.join(__dirname,'commit-product.txt'),'Pin Q0 playback to the first original revision and join retirement\n');
process.stdout.write(`Staged ${roots.length+qa.length} explicit owned paths; no commit or deployment performed.\n`);
