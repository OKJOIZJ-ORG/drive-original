'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium}=require('../node_modules/playwright');
const binding=JSON.parse(fs.readFileSync(path.join(__dirname,'binding.json'))),expression=fs.readFileSync(path.join(__dirname,'observer.expression.js'),'utf8');
const observerSHA256=crypto.createHash('sha256').update(expression).digest('hex');
const memory=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command','Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,FreeVirtualMemory | ConvertTo-Json'],{encoding:'utf8'}));
assert(memory.FreePhysicalMemory>1048576&&memory.FreeVirtualMemory>1572864,'unchanged launch floor');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const cases=[];try{
for(const mode of ['mouse','touch','separate-extra-gesture']){
 const context=await browser.newContext({viewport:{width:1280,height:800},hasTouch:mode==='touch',serviceWorkers:'block'});await context.route('**/*',r=>r.abort());const page=await context.newPage();
 await page.setContent('<style>.file-card{height:20px}#track{position:absolute;left:50px;top:350px;width:1000px;height:40px;touch-action:none}#track span{display:block;width:100%;height:100%}</style><div id="cards"></div><div id="track"><span></span></div>');
 await page.evaluate(binding=>{
  const files=Array.from({length:10},(_,i)=>({id:'synthetic-'+i,name:'synthetic.mp4',mimeType:'video/mp4',size:1024}));
  document.getElementById('cards').innerHTML=files.map(f=>`<div class="file-card" data-file-id="${f.id}"><button class="file-card-open">Synthetic card</button></div>`).join('');
  let callback=null;const video=Object.assign(new EventTarget(),{paused:false,seeking:false,readyState:4,buffered:{length:0},getAttribute:()=>null,requestVideoFrameCallback:f=>{callback=f;return 1;},cancelVideoFrameCallback:()=>{callback=null;}});
  const controller={state:'activated'},track=document.getElementById('track');
  Object.assign(window,{APP_VERSION:binding.version,state:{files,selected:null,accountId:'synthetic',authAccountKey:'synthetic',driveSessionGeneration:1,authStatus:'online',mediaSession:1,mediaAttempt:'idle'},
   el:{videoPlayer:video,seekBarContainer:track,mediaLoading:{hidden:true},mediaError:{hidden:true}},q0Playback:null,q1Playback:null,q1RetirementResult:{settled:true},mediaSourceGeneration:1,mediaSeekWatchdog:null,
   mediaDiagnosticDirectRequestOwners:new Map(),mediaDiagnosticRetiredTraces:new Map(),hasUsableToken:()=>true,isCurrentMediaEvent:()=>state.selected!==null,playerTimeline:()=>({duration:100,currentTime:0}),__driveNightCorpus:{proof:{get:()=>({...binding,controller})}},__inputJournal:[]});
  for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,e=>{if(track.contains(e.target))__inputJournal.push({type,isTrusted:e.isTrusted,pointerId:e.pointerId,pointerType:e.pointerType,button:e.button,isPrimary:e.isPrimary,detail:e.detail,ratio:(e.clientX-50)/1000});},true);
  document.addEventListener('click',e=>{const card=e.target.closest('.file-card');if(card){state.selected=files.find(f=>f.id===card.dataset.fileId);state.mediaSession++;q0Playback={};setTimeout(()=>callback?.(performance.now(),{mediaTime:0,presentedFrames:1}),50);}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){state.selected=null;q0Playback=null;}});
  track.addEventListener('pointerdown',()=>setTimeout(()=>callback?.(performance.now(),{mediaTime:10,presentedFrames:1}),300));
 },binding);
 await page.evaluate(expression=>eval(expression),expression);
 for(let i=0;i<2;i++){await page.locator('.file-card-open').first().click();await page.waitForFunction(n=>window.__rc25PerformanceQA.read().attemptCount===n,i+1);if(i===0)await page.keyboard.press('Escape');}
 await page.evaluate(()=>{el.videoPlayer.paused=true;});
 if(mode==='touch')await page.touchscreen.tap(150,370);else await page.mouse.click(150,370);
 if(mode==='separate-extra-gesture')await page.mouse.click(150,370);
 await page.waitForFunction(()=>window.__rc25PerformanceQA.read().attemptCount===3);
 const result=await page.evaluate(()=>{const r=window.__rc25PerformanceQA.clear();return {rows:r.rows.map(r=>({kind:r.kind,code:r.code})),observerReleased:r.observerReleased,inputJournal:window.__inputJournal};});
 fs.writeFileSync(path.join(__dirname,`native-${mode}.json`),JSON.stringify({mode,observerSHA256,result,nativeInput:true,decodedFramesSynthetic:true,actualAccount:false,physicalDevice:false},null,2)+'\n');
 assert.equal(result.observerReleased,true,'native observer clears listeners/frame callback');
 assert.equal(result.rows[2].code,mode==='separate-extra-gesture'?'EXTRA_INPUT':'TARGET_FRAME',mode);cases.push({mode,passed:true});await context.close();
}
fs.writeFileSync(path.join(__dirname,'native-verification.json'),JSON.stringify({cases,observerSHA256,memory,nativeInput:true,decodedFramesSynthetic:true,actualAccount:false,physicalDevice:false},null,2)+'\n');console.log(JSON.stringify({passed:cases.length,nativeInput:true,decodedFramesSynthetic:true,actualAccount:false}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
