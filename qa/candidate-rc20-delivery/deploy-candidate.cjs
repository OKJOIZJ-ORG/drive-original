'use strict';
// Candidate only. Keep raw CLI output private; print public identity and exit only.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),worker=path.join(root,'worker');
const expected='892722cc9a15177637417a862a91abf49e1f84c4';
const git=args=>cp.execFileSync('git',args,{cwd:root,maxBuffer:12*1024*1024});
if(git(['rev-parse','HEAD']).toString().trim()!==expected)throw Error('CANDIDATE_HEAD_CHANGED');
const config=fs.readFileSync(path.join(worker,'wrangler.jsonc'),'utf8');
if(!/"name"\s*:\s*"drive-original-v2-candidate"/.test(config)
 || !/"CANDIDATE_DRIVE_WRITES_ENABLED"\s*:\s*"false"/.test(config))throw Error('CANDIDATE_SCOPE_REQUIRED');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=[...require('../../scripts/public-files.cjs'),'.nojekyll'];
const before=files.map(file=>{
 const absolute=path.join(root,'_site',file),stat=fs.lstatSync(absolute),bytes=fs.readFileSync(absolute);
 const committed=file==='.nojekyll'?Buffer.alloc(0):git(['show',`${expected}:${file}`]);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1||!bytes.equals(committed))throw Error('CANDIDATE_OUTPUT_MISMATCH '+JSON.stringify({file,isFile:stat.isFile(),symbolicLink:stat.isSymbolicLink(),nlink:stat.nlink,byteEqual:bytes.equals(committed)}));
 return {file,bytes:bytes.length,sha256:sha(bytes)};
});
const actual=[];function walk(dir){for(const name of fs.readdirSync(dir)){const absolute=path.join(dir,name),stat=fs.lstatSync(absolute);if(stat.isSymbolicLink())throw Error('CANDIDATE_LINK');if(stat.isDirectory())walk(absolute);else actual.push(path.relative(path.join(root,'_site'),absolute).split(path.sep).join('/'));}}
walk(path.join(root,'_site'));if(actual.length!==files.length||actual.some(file=>!files.includes(file)))throw Error('CANDIDATE_EXTRA_OUTPUT');
const startedAt=new Date().toISOString();
const run=cp.spawnSync(process.execPath,[path.join(worker,'node_modules/wrangler/bin/wrangler.js'),'deploy','--config','wrangler.jsonc'],{cwd:worker,encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});
const raw=(run.stdout||'')+(run.stderr||'');fs.writeFileSync(path.join(__dirname,'deployment-private.log'),raw);
const version=/Current Version ID:\s*([a-f0-9-]{36})/i.exec(raw)?.[1]||null;
const after=files.map(file=>({file,bytes:fs.statSync(path.join(root,'_site',file)).size,sha256:sha(fs.readFileSync(path.join(root,'_site',file)))}));
const stable=git(['rev-parse','HEAD']).toString().trim()===expected&&JSON.stringify(before)===JSON.stringify(after);
const record={source:expected,startedAt,finishedAt:new Date().toISOString(),exitCode:run.status,signal:run.signal,errorCode:run.error?.code||null,
 passed:run.status===0&&!run.signal&&!run.error&&stable&&Boolean(version),workerVersion:version,stable,
 candidateUrl:'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/',
 assets:before,rawLogSha256:sha(Buffer.from(raw)),producerSha256:sha(fs.readFileSync(__filename)),
 scope:'Authorized free candidate only; global Drive mutations disabled, no production/main/push/automation/original-media changes'};
fs.writeFileSync(path.join(__dirname,'deployment.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({passed:record.passed,source:expected,workerVersion:version,exitCode:run.status,signal:run.signal,stable}));
process.exitCode=record.passed?0:1;
