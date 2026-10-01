'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),worker=path.join(root,'worker');
const SOURCE='1d79897fd32c569137cab079bfd93107be2ee33f',VERSION='1.22.0-rc.32';
const BASE='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/';
const site=path.join(path.dirname(root),'releases','candidates',`Drive-Original-${VERSION}-${SOURCE.slice(0,7)}`);
const git=args=>cp.execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024});
const blob=file=>git(['show',`${SOURCE}:${file}`]);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const manifest={exports:null};vm.runInNewContext(blob('scripts/public-files.cjs').toString(),{module:manifest},{timeout:1000});
const files=manifest.exports;
if(!Array.isArray(files)||files.length!==51||new Set(files).size!==files.length
 ||files.some(file=>typeof file!=='string'||path.posix.normalize(file)!==file||file.startsWith('/')
 ||file.includes('\\')||file.split('/').includes('..')||/^(qa|memory|worker|tests)\//.test(file)))throw Error('PUBLIC_ALLOWLIST_INVALID');
function assertSource(){
 if(path.resolve(git(['rev-parse','--show-toplevel']).toString().trim()).toLowerCase()!==root.toLowerCase()
  ||git(['rev-parse','HEAD']).toString().trim()!==SOURCE)throw Error('FIXED_SOURCE_HEAD_REQUIRED');
 const governing=['.gitattributes','scripts/public-files.cjs','scripts/build-pages.cjs','scripts/materialize-committed-pages.cjs'];
 const scoped=[...files,...governing,'worker'];
 if(git(['status','--porcelain=v1','-z','--untracked-files=all','--',...scoped]).length)throw Error('FIXED_PUBLIC_WORKER_INPUTS_MUST_BE_CLEAN');
 const rows=git(['ls-tree','-r','-z',SOURCE,'--',...scoped]).toString().split('\0').filter(Boolean);
 for(const row of rows){
  const match=/^(100644|100755) blob ([a-f0-9]+)\t(.+)$/.exec(row);if(!match)throw Error('LINKED_SOURCE_FORBIDDEN');
  const [,mode,oid,file]=match,absolute=path.join(root,file),stat=fs.lstatSync(absolute);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1||fs.realpathSync(absolute)!==absolute
   ||git(['hash-object',`--path=${file}`,'--',file]).toString().trim()!==oid)throw Error('FIXED_INPUT_DIFFERS '+file);
 }
 const runtime={};vm.runInNewContext(blob('runtime-config.js').toString(),runtime,{timeout:1000});
 const flags=runtime.__DRIVE_ORIGINAL_RUNTIME__;
 if(flags?.candidate!==true||flags.driveMutationsEnabled!==false||flags.accountStateWritesEnabled!==true
  ||JSON.parse(blob('version.json')).version!==VERSION||!blob('app.js').toString().includes(`const APP_VERSION = '${VERSION}';`))throw Error('CANDIDATE_RUNTIME_SCOPE_REQUIRED');
 const config=JSON.parse(blob('worker/wrangler.jsonc'));
 if(config.name!=='drive-original-v2-candidate'||config.workers_dev!==true||config.preview_urls!==false
  ||config.routes||config.route||config.env||config.vars?.PUBLIC_ORIGIN!==new URL(BASE).origin
  ||config.vars?.CANDIDATE_DRIVE_WRITES_ENABLED!=='false'||config.vars?.AUTH_ENABLED!=='true'
  ||config.assets?.binding!=='ASSETS'||config.assets?.not_found_handling!=='none')throw Error('CANDIDATE_WORKER_SCOPE_REQUIRED');
 return {source:SOURCE,version:VERSION,candidateUrl:BASE,generalDriveWrites:false,accountStateWrites:true};
}
function verifySite(){
 const expected=[...files,'.nojekyll'],found=[];
 if(fs.realpathSync(site)!==site||!fs.lstatSync(site).isDirectory())throw Error('LINKED_SITE_FORBIDDEN');
 function walk(dir){for(const name of fs.readdirSync(dir)){
  const absolute=path.join(dir,name),stat=fs.lstatSync(absolute);
  if(stat.isSymbolicLink()||fs.realpathSync(absolute)!==absolute)throw Error('LINKED_SITE_ENTRY');
  if(stat.isDirectory())walk(absolute);
  else{if(!stat.isFile()||stat.nlink>1)throw Error('INVALID_SITE_ENTRY');found.push(path.relative(site,absolute).split(path.sep).join('/'));}
 }}walk(site);
 if(found.length!==expected.length||found.some(file=>!expected.includes(file)))throw Error('SITE_ALLOWLIST_MISMATCH');
 return expected.map(file=>{
  const bytes=fs.readFileSync(path.join(site,file)),committed=file==='.nojekyll'?Buffer.alloc(0):blob(file);
  if(!bytes.equals(committed))throw Error('SITE_GIT_BYTE_MISMATCH '+file);
  return {file,bytes:bytes.length,sha256:sha(bytes)};
 });
}
function requireDeployment(){
 const deployment=JSON.parse(fs.readFileSync(path.join(__dirname,'deployment.json'),'utf8'));
 if(!deployment.passed||!deployment.stable||deployment.source!==SOURCE||deployment.candidateUrl!==BASE
  ||!/^[a-f0-9-]{36}$/.test(deployment.workerVersion||''))throw Error('EXACT_CANDIDATE_DEPLOYMENT_REQUIRED');
 return deployment;
}
function requireExecute(){if(process.argv.slice(2).join(' ')!=='--execute')throw Error('ROOT_REVIEWED_EXECUTION_REQUIRED (--execute)');}
const cliEnv={...process.env,WRANGLER_SEND_METRICS:'false',DO_NOT_TRACK:'1'};
module.exports={root,worker,SOURCE,VERSION,BASE,site,files,git,blob,sha,assertSource,verifySite,requireDeployment,requireExecute,cliEnv};
if(require.main===module){const scope=assertSource();console.log(JSON.stringify({...scope,assetsPath:site,assets:verifySite().length,passed:true}));}
