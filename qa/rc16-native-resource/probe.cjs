'use strict';
// Reuse the maintained actual-app/SW/provider driver byte-for-byte. Replacements
// below change only QA instrumentation/protocol/output; no served product bytes.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),basePath=path.join(root,'qa/rc15-lifecycle-qualification/qualify.cjs');
const sourceCommit='e57d7b5b3154a2a838d01f631cf71fa063044280';
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const routeName=process.argv[2]||'trend-q2',cycles=Number(process.argv[3]||8);
assert.ok(['trend-q1','trend-q2'].includes(routeName));assert.ok(Number.isInteger(cycles)&&cycles>=1&&cycles<=64);
const publicFiles=require('../../scripts/public-files.cjs');
for(const name of publicFiles)assert.equal(hash(fs.readFileSync(path.join(root,name))),hash(execFileSync('git',['show',`${sourceCommit}:${name}`],{cwd:root,maxBuffer:80*1024*1024})),`SOURCE_COMMIT_BYTES:${name}`);
let source=fs.readFileSync(basePath,'utf8');
const replace=(before,after)=>{assert.ok(source.includes(before),`HARNESS_ANCHOR:${before.slice(0,64)}`);source=source.replace(before,after);};
replace("const mode=process.argv[2]||'discriminator';",`const mode='${routeName}';`);
replace("mode.startsWith('trend-')?16:50",`mode.startsWith('trend-')?${cycles}:50`);
replace("harness:Object.fromEntries(",`sourceCommit:'${sourceCommit}',adapterSha256:'${hash(fs.readFileSync(__filename))}',observerSha256:'${hash(fs.readFileSync(path.join(__dirname,'weak-observer.js')))}',baseSha256:'${hash(fs.readFileSync(basePath))}',nativeObservations:[],harness:Object.fromEntries(`);
replace("['qualify.cjs','resource-snapshot.py','fixtures.py', '../q1-q2-app-integration/native-retirement-smoke.cjs','../q1-product-audit.cjs']", "['../rc15-lifecycle-qualification/qualify.cjs','../rc15-lifecycle-qualification/resource-snapshot.py','../rc15-lifecycle-qualification/fixtures.py','../q1-q2-app-integration/native-retirement-smoke.cjs','../q1-product-audit.cjs']");
replace("path.join(__dirname,'resource-snapshot.py')", "path.join(root,'qa/rc15-lifecycle-qualification/resource-snapshot.py')");
replace("const fixturePaths={aac:'qa/faststart-h264-aac.mp4',ac3:'qa/q2-audio-compatibility/synthetic-avc-ac3.mp4',longaac:'qa/rc15-lifecycle-qualification/synthetic-72s-aac.mp4',longac3:'qa/rc15-lifecycle-qualification/synthetic-72s-ac3.mp4'};", "const fixturePaths={aac:'qa/faststart-h264-aac.mp4',ac3:'qa/q2-audio-compatibility/synthetic-avc-ac3.mp4'};");
replace(" const page=await context.newPage(),errors=[]", " await context.addInitScript({path:path.join(__dirname,'weak-observer.js')});\n const page=await context.newPage(),errors=[]");
replace("const cdp=await context.newCDPSession(page);",`const cdp=await context.newCDPSession(page);
 const collect=async()=>{await page.waitForTimeout(30);await cdp.send('HeapProfiler.collectGarbage');await page.waitForTimeout(30);await cdp.send('HeapProfiler.collectGarbage');await page.waitForTimeout(30);return page.evaluate(()=>qaNativeWeakSnapshot());};
 let nativeSampling=false;try{await cdp.send('Memory.startSampling',{samplingInterval:65536,suppressRandomness:true});nativeSampling=true;}catch(e){report.nativeSamplingUnavailable=e.name;}
 const nativeObserve=async phase=>{const weak=await collect();const targets=(await browserCdp.send('Target.getTargets')).targetInfos;const targetCounts={};for(const t of targets)targetCounts[t.type]=(targetCounts[t.type]||0)+1;
  let profile=null;if(nativeSampling){try{profile=(await cdp.send('Memory.getSamplingProfile')).profile;}catch(e){report.nativeProfileUnavailable=e.name;}}
  const observation={phase,weak,playwrightLiveWorkers:page.workers().length,targetCounts,nativeProfile:profile};report.nativeObservations.push(observation);save();await sample(phase);return observation;
 };
 await nativeObserve('before-cycles');`);
replace("return {context,page,read,open,seek,close,network,errors,engineErrors};", "return {context,page,read,open,seek,close,network,errors,engineErrors,nativeObserve,collect};");
replace("if(i%(mode.startsWith('trend-')?4:5)===0)await sample(`cycle-${i}-closed`);", "if(i===1||i%4===0||i==="+cycles+")await t.nativeObserve(`cycle-${i}-closed`);");
replace("await t.page.waitForTimeout(15000);await sample('trend-idle-15s');",`await t.page.waitForTimeout(15000);await t.nativeObserve('idle-15s-control-held');
  await t.page.evaluate(()=>qaReleaseNativeControl());await t.nativeObserve('strong-control-released');
  // One reversible internal notification in this isolated browser. It is not
  // host pressure, OS configuration, or the user's normal Chrome instance.
  try{await browserCdp.send('Memory.simulatePressureNotification',{level:'moderate'});report.moderatePressureSent=true;}catch(e){report.moderatePressureUnavailable=e.name;}
  await t.page.waitForTimeout(5000);await t.nativeObserve('after-isolated-moderate-notification');`);
replace("report.producerEnd=hashes();assert.deepEqual(report.producerStart,report.producerEnd,'PRODUCT_BYTES_CHANGED');", "report.producerEnd=hashes();assert.deepEqual(report.producerStart,report.producerEnd,'PRODUCT_BYTES_CHANGED');");
const compiled=new Module(__filename,module);compiled.filename=__filename;compiled.paths=module.paths;compiled._compile(source,__filename);
