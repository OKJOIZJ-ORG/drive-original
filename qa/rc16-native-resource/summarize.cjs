'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),commit='e57d7b5b3154a2a838d01f631cf71fa063044280';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),read=f=>fs.readFileSync(path.join(__dirname,f));
const publicFiles=require('../../scripts/public-files.cjs');
const pinned=Object.fromEntries(publicFiles.map(f=>[f,hash(execFileSync('git',['show',`${commit}:${f}`],{cwd:root,maxBuffer:80*1024*1024}))]));
const producers=['probe.cjs','network-shed.cjs','capped-network.cjs','reset-network.cjs','producer-network-shed-bridge-failure.cjs','producer-capped-network-control-count-failure.cjs','producer-reset-network-owner-race.cjs'];
const byHash=Object.fromEntries(producers.map(f=>[hash(read(f)),f]));
const raws=fs.readdirSync(__dirname).filter(f=>/^(cycles|trend-q[12])-.*\.json$/.test(f)).sort();
const runs=raws.map(file=>{
 const r=JSON.parse(read(file));assert.equal(r.sourceCommit,commit,file);assert.deepEqual(r.producerStart,pinned,`${file}:start`);assert.deepEqual(r.producerEnd,pinned,`${file}:end`);
 const producer=byHash[r.adapterSha256];assert.ok(producer,`${file}:exact producer`);
 assert.equal(r.observerSha256,hash(read('weak-observer.js')),`${file}:observer`);
 if(r.wrapperAdapterSha256)assert.equal(r.wrapperAdapterSha256,hash(read('probe.cjs')),`${file}:wrapper adapter`);
 assert.equal(r.baseSha256,hash(fs.readFileSync(path.join(root,'qa/rc15-lifecycle-qualification/qualify.cjs'))),`${file}:maintained base`);
 if(r.playwrightCoreSha256)assert.equal(r.playwrightCoreSha256,hash(fs.readFileSync(path.join(root,'qa/node_modules/playwright-core/lib/coreBundle.js'))),`${file}:Playwright implementation`);
 const resource=r.resources.map(x=>({phase:x.phase,totalPrivateMiB:x.chromePrivateBytes/1048576,renderers:x.processes.filter(p=>p.type==='renderer').map(p=>({pid:p.pid,privateMiB:p.privateBytes/1048576})),commitHeadroomGiB:x.host.commitAvailableGiB,physicalHeadroomGiB:x.host.physicalAvailableGiB}));
 const passed=r.results.filter(x=>x.passed),routeCounts={};for(const v of passed)routeCounts[v.route]=(routeCounts[v.route]||0)+1;
 return {file,producer,browser:r.browser,passed:r.passed,passedCycles:passed.length,passedNativeSeeks:passed.reduce((n,x)=>n+x.seeks.length,0),routeCounts,failure:r.failure??null,publicBytesVerified:true,observerReset:!!r.observerReset,disabledSettleMs:r.observerDisabledSettleMs??0,networkCap:r.networkCap??null,
  weakSnapshots:r.nativeObservations.map(x=>({phase:x.phase,counts:x.weak.counts,strongControlHeld:x.weak.strongControlHeld,liveWorkers:x.playwrightLiveWorkers,targetCounts:x.targetCounts,sampledEstimatedBytes:x.nativeProfile?.samples.reduce((n,s)=>n+s.total,0)})),resource};
});
assert.equal(runs.length,10,'TEN_ATTEMPTS_PRESERVED');
const final=runs.find(x=>x.observerReset&&x.disabledSettleMs===5000&&x.passedCycles===50);assert.ok(final?.passed,'FINAL_50_REQUIRED');assert.equal(final.passedNativeSeeks,150);
const finalRaw=JSON.parse(read(final.file));assert.equal(finalRaw.networkResets.length,50);assert.ok(finalRaw.networkResets.every(x=>x.sessions.length===2&&x.sessions.every(s=>s.networkReenabled&&s.cacheDisabled)));
const last=final.weakSnapshots.at(-1);for(const type of ['mediaSource','sourceBuffer','worker']){assert.equal(last.counts[type].alive,0);assert.equal(last.counts[type].collected,last.counts[type].created);assert.equal(last.counts[type].finalized,last.counts[type].created);}
assert.equal(last.liveWorkers,0);assert.equal(last.targetCounts.worker??0,0);
for(const result of finalRaw.results){assert.equal(result.after.sw.activeOwners,0);assert.equal(result.after.sw.cleanupFences,0);assert.equal(result.after.sw.q0Pins,0);assert.equal(result.after.sw.q0Acquisitions,0);assert.equal(result.after.resources.activeWorkers,0);assert.equal(result.after.resources.activeUrls,0);}
const closed=final.resource.filter(x=>/^cycle-\d+-closed$/.test(x.phase));
const mainPid=closed[0].renderers.reduce((a,b)=>a.privateMiB>b.privateMiB?a:b).pid;
const main=closed.map(x=>({cycle:+/^cycle-(\d+)-/.exec(x.phase)[1],privateMiB:x.renderers.find(p=>p.pid===mainPid).privateMiB,totalPrivateMiB:x.totalPrivateMiB}));
const summary={sourceCommit:commit,publicFileCount:publicFiles.length,browserVersions:[...new Set(runs.map(r=>r.browser))],runs,final50:{file:final.file,routeCounts:final.routeCounts,nativeSeeks:150,mainRendererPid:mainPid,closedSamples:main,finalWeakCounts:last.counts,minCommitHeadroomGiB:Math.min(...final.resource.map(x=>x.commitHeadroomGiB)),minPhysicalHeadroomGiB:Math.min(...final.resource.map(x=>x.physicalHeadroomGiB))},limits:['Synthetic local actual-app/SW proof; no Google/account/device/audible/production acceptance.','Network observer reset and closed-cycle5s dwell change instrumentation and cadence; this is not a normal-runtime native-memory ceiling.','Unsymbolized native sampling totals are estimates, not full process native memory; Q1 profile and Windows PID reclaim disagree.','Historical cold decoder-open failure remains unexplained; preserved old rc15 records are not erased.']};
fs.writeFileSync(path.join(__dirname,'summary.json'),JSON.stringify(summary,null,2)+'\n');
const curated=[...raws,...producers,'weak-observer.js','attempt-network-adapter-prelaunch.txt','summarize.cjs','README.md','summary.json'];
for(const f of curated)assert.ok(fs.existsSync(path.join(__dirname,f)),f);
const manifest={sourceCommit:commit,publicSha256:pinned,files:curated.map(f=>({path:`qa/rc16-native-resource/${f}`,sha256:hash(read(f)),bytes:read(f).length})),dependencies:['qa/rc15-lifecycle-qualification/qualify.cjs','qa/rc15-lifecycle-qualification/resource-snapshot.py','qa/host-resource-snapshot.py','qa/q1-q2-app-integration/native-retirement-smoke.cjs','qa/q1-product-audit.cjs'].map(f=>({path:f,sha256:hash(fs.readFileSync(path.join(root,f)))})),excluded:['qa/node_modules','SDK/cache/private profiles/accounts/original media','regenerable synthetic MP4 fixtures already hash-bound by raw records']};
fs.writeFileSync(path.join(__dirname,'evidence-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(__dirname,'curated-savepoint.txt'),[...curated.map(f=>`qa/rc16-native-resource/${f}`),'qa/rc16-native-resource/evidence-manifest.json','qa/rc16-native-resource/curated-savepoint.txt'].join('\n')+'\n');
console.log(JSON.stringify({attempts:runs.length,sourceCommit:commit,final50:summary.final50,curatedFiles:curated.length+2},null,2));
