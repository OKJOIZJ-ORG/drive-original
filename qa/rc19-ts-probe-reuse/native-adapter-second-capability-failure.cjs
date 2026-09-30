'use strict';
// Scoped adapter for maintained synthetic provider/app/SW runner, no private sample.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'qa/q1-product-audit.cjs');
let s=fs.readFileSync(base,'utf8').replace(/\r\n/g,'\n');
const replace=(a,b)=>{if(!s.includes(a))throw Error('ADAPTER_ANCHOR_MISSING');s=s.replace(a,b);};
replace("'Content-Type':mime[path.extname(file)]","'Content-Type':mime[path.extname(file)]||'application/octet-stream'");
replace("const results=[];let browser;",`const results=[];let browser,browserCdp;
const {execFileSync}=require('node:child_process');const observations=[];
const resource=(processes=[])=>JSON.parse(execFileSync('python',[path.join(root,'qa/rc15-lifecycle-qualification/resource-snapshot.py'),JSON.stringify(processes)],{encoding:'utf8',timeout:15000}));
const guard=r=>{assert.ok(r.host.commitAvailableGiB>=1.5,'HOST_COMMIT_HEADROOM_STOP');assert.ok(r.host.physicalAvailableGiB>=1,'HOST_PHYSICAL_HEADROOM_STOP');};
const nativeSample=async phase=>{const p=await browserCdp.send('SystemInfo.getProcessInfo'),r={phase,...resource(p.processInfo)};observations.push(r);guard(r);};
const before=resource();observations.push({phase:'before-launch',...before});guard(before);`);
replace("const before=resource();",`process.on('uncaughtException',async error=>{
  const record={passed:false,scope:'QA uncaught failure; owned browser/server cleanup attempted',failure:{name:error.name,code:/^[A-Z_]+$/.test(error.code)?error.code:null},sources,observations};
  const file=path.join(root,'qa/rc19-ts-probe-reuse/fatal-'+Date.now()+'.json');fs.writeFileSync(file,JSON.stringify(record,null,2));
  try{await browser?.close();record.browserClosed=true;}catch{}try{await new Promise(r=>server.close(r));record.serverClosed=true;}catch{}
  fs.writeFileSync(file,JSON.stringify(record,null,2));process.exitCode=1;
});
const before=resource();`);
replace("browser=await chromium.launch({channel:'chrome',headless:true});",`browser=await chromium.launch({channel:'chrome',headless:true});browserCdp=await browser.newBrowserCDPSession();await nativeSample('launched');`);
replace("state.authAccountKey='synthetic-account';state.accountId='synthetic-account';state.tokenRevision=1;",`state.authAccountKey='synthetic-account';state.accountId='synthetic-account';state.tokenRevision=1;
        state.driveSessionGeneration=1;state.authCapabilities={version:1,driveRead:true,driveWrite:false,appData:false};`);
replace("for(const seconds of [1.2,6.1,0,1000,11.95]){",`for(const seconds of [1.2,6.1,0,1000,11.95]){
          await nativeSample('before-seek-'+seconds);`);
replace("const seeks=[];",`assert.equal(await page.evaluate(()=>q1Playback.player.stats().probeInputReused),true);
        const seeks=[];`);
replace("const frame=await page.evaluate(()=>({mediaTime:q1Playback.player.stats().lastMediaTime,width:el.videoPlayer.videoWidth,",`const frame=await page.evaluate(()=>({reused:q1Playback.player.stats().probeInputReused,mediaTime:q1Playback.player.stats().lastMediaTime,width:el.videoPlayer.videoWidth,`);
replace("assert.equal(frame.paused,true);",`assert.equal(frame.reused,true);assert.equal(frame.paused,true);`);
replace("assert.equal(assetCache.length,6,'ALL_Q1_PUBLIC_ASSETS_PRECACHED');",`assert(assetCache.every(name=>allowed.has(name.slice(1))),'CACHE_ONLY_PUBLIC_ASSETS');
        for(const file of ['media/ts-player.mjs','media/drive-source.mjs','media/q1-core.mjs','media/transmux-worker.mjs','media/mux-mp4.min.js'])assert(assetCache.includes('/'+file),'REQUIRED_Q1_ASSET_PRECACHED');
        await nativeSample('closed-app');`);
replace("const out=path.join(__dirname,cycleReport||separateNormal?'q1-cycles':'q1-product');",`const out=path.join(root,'qa/rc19-ts-probe-reuse');`);
replace("const reportName=reportTag&& (cycleReport||separateNormal)","const reportName='native-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'; const unusedReportName=reportTag&& (cycleReport||separateNormal)");
replace("sources,reportTag:reportTag||null,fixtures:",`sourceBase:'f6749c1a1b1a8345f8f76606786e0c1ccb48b21c',browserVersion:browser?.version(),observations,adapterSHA256:'${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}',sources,reportTag:reportTag||null,fixtures:`);
replace("if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));",`if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
  const name=path.join(out,reportName),record=JSON.parse(fs.readFileSync(name,'utf8'));record.browserClosed=true;record.serverClosed=true;record.sourcesAfter=sourceHashes();assert.deepEqual(record.sourcesAfter,sources);fs.writeFileSync(name,JSON.stringify(record,null,2)+'\\n');`);
fs.writeFileSync(path.join(__dirname,'native-driver.cjs'),s);
process.argv[2]='early-to-q1';
const adapted=new Module(base,module);adapted.filename=base;adapted.paths=Module._nodeModulePaths(path.dirname(base));adapted._compile(s,base);
