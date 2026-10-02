'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),worker=path.join(root,'worker');
const SOURCE='051dc3456f5000b958a18593848769b3687991e5',VERSION='1.22.0-rc.37';
const BASE='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/';
const site=path.join(path.dirname(root),'releases','candidates',`Drive-Original-${VERSION}-${SOURCE.slice(0,7)}`);
const git=args=>cp.execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024});
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const blob=file=>{if(!/^[a-f0-9]{40}$/.test(SOURCE))throw Error('RC37_SOURCE_PIN_REQUIRED');return git(['show',`${SOURCE}:${file}`]);};
function validateManifest(bytes){
 const module={exports:null};vm.runInNewContext(bytes.toString(),{module},{timeout:1000});const files=module.exports;
 if(!Array.isArray(files)||!files.length||new Set(files).size!==files.length||files.some(file=>typeof file!=='string'||!file||path.posix.normalize(file)!==file||path.win32.isAbsolute(file)||file.includes(':')||file.includes('\\')||file.split('/').includes('..')||/^(qa|memory|worker|tests)\//.test(file)))throw Error('PUBLIC_ALLOWLIST_INVALID');
 if(!files.includes('media/native-color.mjs'))throw Error('OBSERVED_COLOR_PUBLIC_ASSET_REQUIRED');
 return Object.freeze(Array.from(files));
}
let manifest;const getFiles=()=>manifest||=validateManifest(blob('scripts/public-files.cjs'));
function shellFiles(){
 const match=blob('sw.js').toString().match(/const SHELL_FILES = (\[[\s\S]*?\]);/);if(!match)throw Error('SHELL_LIST_REQUIRED');
 const names=Array.from(vm.runInNewContext(match[1],{},{timeout:1000})),files=names.filter(x=>x!=='./').map(x=>x.replace(/^\.\//,''));
 if(names.filter(x=>x==='./').length!==1||new Set(files).size!==files.length||files.some(file=>!getFiles().includes(file))||!files.includes('media/native-color.mjs'))throw Error('SHELL_ALLOWLIST_INVALID');
 return files;
}
function validateScope(flags,config){
 if(flags?.candidate!==true||flags.driveMutationsEnabled!==false||flags.accountStateWritesEnabled!==true)throw Error('CANDIDATE_RUNTIME_SCOPE_REQUIRED');
 if(config.name!=='drive-original-v2-candidate'||config.workers_dev!==true||config.preview_urls!==false||config.routes||config.route||config.env||config.vars?.PUBLIC_ORIGIN!==new URL(BASE).origin||config.vars?.CANDIDATE_DRIVE_WRITES_ENABLED!=='false'||config.vars?.AUTH_ENABLED!=='true'||config.vars?.AUTH_DIAGNOSTICS!=='true'||config.assets?.binding!=='ASSETS'||config.assets?.not_found_handling!=='none'||config.observability?.enabled!==false)throw Error('CANDIDATE_WORKER_SCOPE_REQUIRED');
}
function assertSource(){
 if(!/^[a-f0-9]{40}$/.test(SOURCE))throw Error('RC37_SOURCE_PIN_REQUIRED');
 if(path.resolve(git(['rev-parse','--show-toplevel']).toString().trim()).toLowerCase()!==root.toLowerCase()||git(['rev-parse','HEAD']).toString().trim()!==SOURCE)throw Error('FIXED_SOURCE_HEAD_REQUIRED');
 const governing=['.gitattributes','scripts/public-files.cjs','scripts/build-pages.cjs','scripts/materialize-committed-pages.cjs','scripts/build-audio-compat.cjs','media/audio-codec-build.json','media/mediabunny-q1-build.json','media/build.json'];
 const scoped=[...getFiles(),...governing,'worker'];
 if(git(['status','--porcelain=v1','-z','--untracked-files=all','--',...scoped]).length)throw Error('FIXED_PUBLIC_WORKER_INPUTS_MUST_BE_CLEAN');
 for(const row of git(['ls-tree','-r','-z',SOURCE,'--',...scoped]).toString().split('\0').filter(Boolean)){
  const match=/^(100644|100755) blob ([a-f0-9]+)\t(.+)$/.exec(row);if(!match)throw Error('LINKED_SOURCE_FORBIDDEN');
  const [,mode,oid,file]=match,absolute=path.join(root,file),stat=fs.lstatSync(absolute);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1||fs.realpathSync(absolute)!==absolute||git(['hash-object',`--path=${file}`,'--',file]).toString().trim()!==oid)throw Error('FIXED_INPUT_DIFFERS '+file);
 }
 const runtime={};vm.runInNewContext(blob('runtime-config.js').toString(),runtime,{timeout:1000});validateScope(runtime.__DRIVE_ORIGINAL_RUNTIME__,JSON.parse(blob('worker/wrangler.jsonc')));
 if(!blob('sw.js').toString().includes(`const VERSION = '${VERSION}';`)||JSON.parse(blob('version.json')).version!==VERSION||!blob('app.js').toString().includes(`const APP_VERSION = '${VERSION}';`))throw Error('CANDIDATE_VERSION_MISMATCH');
 const cached=shellFiles();return{source:SOURCE,version:VERSION,candidateUrl:BASE,publicAssets:getFiles().length+1,shellAssets:cached.length,rootCacheAlias:1,generalDriveWrites:false,accountStateWrites:true};
}
function verifySite(){
 const expected=[...getFiles(),'.nojekyll'],found=[];
 if(fs.realpathSync(site)!==site||!fs.lstatSync(site).isDirectory())throw Error('LINKED_SITE_FORBIDDEN');
 function walk(dir){for(const name of fs.readdirSync(dir)){const absolute=path.join(dir,name),stat=fs.lstatSync(absolute);if(stat.isSymbolicLink()||fs.realpathSync(absolute)!==absolute)throw Error('LINKED_SITE_ENTRY');if(stat.isDirectory())walk(absolute);else{if(!stat.isFile()||stat.nlink>1)throw Error('INVALID_SITE_ENTRY');found.push(path.relative(site,absolute).split(path.sep).join('/'));}}}walk(site);
 if(found.length!==expected.length||found.some(file=>!expected.includes(file)))throw Error('SITE_ALLOWLIST_MISMATCH');
 return expected.map(file=>{const bytes=fs.readFileSync(path.join(site,file)),committed=file==='.nojekyll'?Buffer.alloc(0):blob(file);if(!bytes.equals(committed))throw Error('SITE_GIT_BYTE_MISMATCH '+file);return{file,bytes:bytes.length,sha256:sha(bytes)};});
}
function requireDeployment(){const record=JSON.parse(fs.readFileSync(path.join(__dirname,'deployment.json'),'utf8'));if(!record.passed||!record.stable||record.source!==SOURCE||record.candidateUrl!==BASE||!/^[a-f0-9-]{36}$/.test(record.workerVersion||''))throw Error('EXACT_CANDIDATE_DEPLOYMENT_REQUIRED');return record;}
function requireExecute(){if(!process.argv.includes('--execute'))throw Error('ROOT_REVIEWED_EXECUTION_REQUIRED (--execute)');}
function save(name,record){const target=path.join(__dirname,name);if(path.basename(name)!==name)throw Error('QA_RECORD_NAME_REQUIRED');fs.writeFileSync(target,JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
const cliEnv={...process.env,WRANGLER_SEND_METRICS:'false',DO_NOT_TRACK:'1'};
module.exports={root,worker,SOURCE,VERSION,BASE,site,git,blob,sha,validateManifest,validateScope,shellFiles,assertSource,verifySite,requireDeployment,requireExecute,save,cliEnv,get files(){return getFiles();}};
if(require.main===module)console.log(JSON.stringify({...assertSource(),passed:true,deliveryPerformed:false}));

