'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const product=['.gitattributes','app.js','index.html','sw.js','version.json','media/build.json','media/q1-core.mjs','media/transmux-worker.mjs','tests/app.test.js','tests/static.test.js',
 ...['elementary-stream','fragment-clock','gop-stream','seek-input','transmux-session','ts-seek','video-clock','video-clock.test'].map(x=>'qa/v2-07b-ts-q1/'+x+'.mjs')];
const diagnostic=['analyzer.mjs','build.mjs','collector-provenance.json','collector.expression.js','collector.mjs','collector.test.mjs','facade.function.js','factory.expression.js','provenance.json','README.md','verify.mjs'].map(x=>'qa/rc29-ts-gop-diagnostic/'+x);
const short=['README.md','fixture.mjs','short-eof.test.mjs','baseline.mjs','baseline-results.json','preservation.mjs','preservation-results.json'].map(x=>'qa/rc30-ts-short-eof/'+x);
const integration=['README.md','run-product-tests.cjs','product-tests.json','independent-ts-review.json','curate-savepoint.cjs'].map(x=>'qa/rc30-product-integration/'+x);
const prep=['bind-source.cjs','DELIVERY-PREPARATION.md','local-delivery-preparation.json'].map(x=>'qa/candidate-rc30-delivery/'+x);
const oldManifest='qa/rc29-performance-blocked-seek/staging-manifest.json',old=JSON.parse(fs.readFileSync(path.join(root,oldManifest)));
const regular=file=>{assert.ok(file===path.posix.normalize(file)&&!file.startsWith('/')&&!file.includes('\\')&&!file.split('/').includes('..'));const p=path.join(root,file),s=fs.lstatSync(p);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&fs.realpathSync(p)===p);return fs.readFileSync(p);};
for(const r of old.files){assert.ok(r.path.startsWith('qa/rc29-performance-blocked-seek/'));const b=regular(r.path);assert.equal(b.length,r.bytes);assert.equal(sha(b),r.sha256);}
const actual='qa/rc29-resume-20261001/actual-ts-gop-diagnostic-safe.json',actualBytes=regular(actual);assert.equal(actualBytes.length,6743);assert.equal(sha(actualBytes),'028a35db032d1a90e087e14a2757c8441b2b93195f277232e7c69ee44365ec4f');
const archives=process.argv.slice(2);assert.equal(archives.length,2);assert.ok(archives.every(x=>/^memory\/checkpoints\/20261001-\d{6}-rc30-[a-z-]+\.md$/.test(x)));
const files=[...new Set([...product,...diagnostic,...short,...integration,...prep,...old.files.map(r=>r.path),oldManifest,actual,'memory/CHECKPOINT.md','memory/00-INDEX.md','memory/TS-SHORT-EOF-20261001.md',...archives])].sort();
const rows=files.map(file=>{assert.ok(!/(?:^|\/)(?:generated|node_modules|private)(?:\/|$)|(?:raw|\.log$)/i.test(file));const b=regular(file);return {file,bytes:b.length,sha256:sha(b)};});
const report={schema:'drive-original.rc30-reviewed-local-savepoint/1',baselineSource:'5f6dae39a6a601207ff2c9e462b3ec8d610e91b4',version:'1.22.0-rc.30',actualDeployment:false,actualReplay:false,syntheticGeneratedBinariesExcluded:true,privateRawLogsExcluded:true,files:rows};
const manifest='qa/rc30-product-integration/safe-staging-manifest.json';fs.writeFileSync(path.join(root,manifest),JSON.stringify(report,null,2)+'\n');
cp.execFileSync('git',['add','-f','--',...files,manifest],{cwd:root,windowsHide:true});
const staged=cp.execFileSync('git',['diff','--cached','--name-only','-z'],{cwd:root,windowsHide:true}).toString().split('\0').filter(Boolean).sort();assert.deepEqual(staged,[...files,manifest].sort());
for(const file of [...files,manifest]){const source=regular(file),index=cp.execFileSync('git',['show',':'+file],{cwd:root,windowsHide:true,maxBuffer:8*1024*1024});
 if(file.startsWith('qa/rc29-')||file.startsWith('qa/rc30-')||file.startsWith('qa/candidate-rc30-'))assert.ok(source.equals(index),'Exact QA bytes required: '+file);
 else assert.ok(Buffer.from(source.toString().replace(/\r\n/g,'\n')).equals(Buffer.from(index.toString().replace(/\r\n/g,'\n'))),'Only governed text normalization permitted: '+file);
}
console.log(JSON.stringify({safeExactPaths:staged.length,sha256:sha(regular(manifest)),stagedOnlyTaskOwned:true,privateRawLogsExcluded:true}));
