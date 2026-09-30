'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const basePath = path.join(root, 'qa/q1-auth-audit.cjs');
const original = fs.readFileSync(basePath, 'utf8');
const baseSha256 = createHash('sha256').update(original).digest('hex');
let code = original;
const change = (from, to) => {
  assert.ok(code.includes(from), `Missing fork anchor: ${from}`);
  code = code.replace(from, to);
};
change("const root=path.resolve(__dirname,'..'),allowed=new Set(require('../scripts/public-files.cjs'));",
  "const root=path.resolve(__dirname,'../..'),allowed=new Set(require('../../scripts/public-files.cjs'));const qaRoot=path.join(root,'qa');");
change("path.join(__dirname,'v2-07b-ts-q1/synthetic-bframes-audiolead.ts')", "path.join(qaRoot,'v2-07b-ts-q1/synthetic-bframes-audiolead.ts')");
change("path.join(__dirname,'faststart-h264-aac.mp4')", "path.join(qaRoot,'faststart-h264-aac.mp4')");
change("'Content-Type':mime[path.extname(file)]", "'Content-Type':mime[path.extname(file)]||(path.extname(file)==='.wasm'?'application/wasm':'application/octet-stream')");
change("const credential=()=>({accessToken:", "const credential=()=>({capabilities:{version:1,driveRead:true,driveWrite:true,appData:true},accessToken:");
change("state.demo=false;state.token='synthetic-old';", "state.demo=false;state.authCapabilities={version:1,driveRead:true,driveWrite:true,appData:true};state.token='synthetic-old';");
change("await page.waitForFunction(()=>typeof startInitialOriginalPlayback==='function'&&navigator.serviceWorker.controller);", "await page.waitForFunction(()=>typeof startInitialOriginalPlayback==='function'&&navigator.serviceWorker.controller&&el.setupView?.getAttribute('aria-busy')==='false'&&!el.libraryView.hidden&&updateCheckGeneration>0&&state.serviceWorkerRegistration?.active===navigator.serviceWorker.controller&&state.serviceWorkerRegistration.active.state==='activated'&&!state.serviceWorkerRegistration.installing&&!state.serviceWorkerRegistration.waiting);");
change("['qa/q1-auth-audit.cjs',...allowed]", "['qa/q1-auth-audit.cjs','qa/rc22-renewal-diagnosis/q1-auth-audit.cjs',...allowed]");
change("assert.equal(authCalls,mode==='range-403'?0:1)", "assert.equal(authCalls,mode==='range-403'?0:mode==='refresh-unavailable'&&!baseline?3:1)");
change('const results=[];let browser;', `const results=[];let browser;let launchMemory;
const forkProvenance={base:'qa/q1-auth-audit.cjs',sha256:'${baseSha256}',changes:'owned paths, current public MIME/full-grant fixtures/settled startup, memory floor, provenance, diagnosed unavailable3attempts'};
function guardMemory(){launchMemory=JSON.parse(execFileSync('powershell',['-NoProfile','-Command','Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,FreeVirtualMemory | ConvertTo-Json -Compress'],{encoding:'utf8'}));assert.ok(launchMemory.FreePhysicalMemory>1048576,'PHYSICAL_LAUNCH_FLOOR');assert.ok(launchMemory.FreeVirtualMemory>1572864,'VIRTUAL_LAUNCH_FLOOR');}
`);
change("browser=await chromium.launch({channel:'chrome',headless:true});", "guardMemory();browser=await chromium.launch({channel:'chrome',headless:true});");
change("path.join(__dirname,retirementRun?'q1-auth-cleanup':'q1-auth')", "path.join(__dirname,'native',retirementRun?'q1-auth-cleanup':'q1-auth')");
change('syntheticOnly:true,baseline,baselineSource,sources,', 'syntheticOnly:true,forkProvenance,launchMemory,baseline,baselineSource,sources,');
fs.writeFileSync(path.join(__dirname, 'q1-auth-audit.cjs'), code);
console.log(JSON.stringify({ baseSha256, forkBytes: Buffer.byteLength(code) }));
