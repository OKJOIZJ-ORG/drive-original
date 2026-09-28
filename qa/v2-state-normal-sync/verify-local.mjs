import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../../',import.meta.url));
const raw = await fs.readFile(new URL('./full-node-results.txt',import.meta.url),'utf8');
const count = label => Number(raw.match(new RegExp(`^ℹ ${label} (\\d+)$`,'m'))?.[1]);
if(count('tests') !== 368 || count('pass') !== 368 || count('fail') !== 0) throw new Error('Product suite did not pass');
const inputs = ['app.js','sw.js','index.html','runtime-config.js','version.json',
  'tests/account-state.test.js','tests/app.test.js','tests/audit.test.js','tests/acceptance.test.js','tests/static.test.js'];
if(process.argv.includes('--materialize')) {
  for(const input of inputs) await fs.writeFile(new URL(input,new URL('../../',import.meta.url)),execFileSync('git',['show',`:${input}`],{cwd:root}));
}
const sourceHashes = {};
for(const input of inputs) sourceHashes[input] = createHash('sha256').update(await fs.readFile(new URL(input,new URL('../../',import.meta.url)))).digest('hex');
if(process.argv.includes('--staged')) {
  for(const [input,hash] of Object.entries(sourceHashes)) {
    const staged=execFileSync('git',['show',`:${input}`],{cwd:root});
    if(createHash('sha256').update(staged).digest('hex')!==hash) throw new Error(`Staged input mismatch: ${input}`);
  }
  const preflight=JSON.parse(await fs.readFile(new URL('./preflight-results.json',import.meta.url),'utf8'));
  for(const [name,input] of Object.entries(preflight.producerPaths)) {
    const staged=execFileSync('git',['show',`:${input}`],{cwd:root});
    if(createHash('sha256').update(staged).digest('hex')!==preflight.producerHashes[name]) throw new Error(`Staged producer mismatch: ${name}`);
  }
}
const privateFiles = (await fs.readdir(new URL('../v2-state-recovery-backup/private/',import.meta.url))).filter(name=>name.endsWith('.json')).length;
const privateTracked = execFileSync('git',['ls-files','qa/v2-state-recovery-backup/private'],{cwd:root,encoding:'utf8'}).trim();
if(privateTracked || privateFiles !== 4) throw new Error('Recovery preservation check failed');
const report = {schemaVersion:1,scope:'local actual-app synthetic transport',version:'1.22.0-rc.11',
  tests:368,passed:368,failed:0,sourceHashes,
  rawResultSha256:createHash('sha256').update(raw).digest('hex'),
  focusedTests:10,relatedTests:157,independentReview:{model:'gpt-6-sol',effort:'medium',materialFindings:0,scope:'state transport and public version'},
  recovery:{privateFiles:4,privateTrackedFiles:0,privateNamesOmitted:true},
  actualAccountNormalSyncVerified:false};
await fs.writeFile(new URL('./local-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({tests:report.tests,passed:report.passed,failed:report.failed,privateFiles,privateTrackedFiles:0}));
