'use strict';
// Narrow controlled app error-adapter discriminator, no modules/network/browser.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),appBytes=fs.readFileSync(path.join(root,'app.js')),app=appBytes.toString().replace(/\r\n/g,'\n'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const start=app.indexOf('  const stopFailure = code => {',app.indexOf('async function tryOriginalTsPlayback(')),end=app.indexOf('  try {',start);
assert.ok(start>0&&end>start);const adapter=app.slice(start,end);
const rows=[];
for(const [route,code,isCurrent] of [['Q1','Q1_SOURCE_CONTENT_DRIFT',true],['Q2','GENERAL_CONTENT_CHANGED',true],['Q1-stale','Q1_SOURCE_CONTENT_DRIFT',false]]){
 const owner={route},s={owner,state:{mediaAttempt:'q1'},session:7,events:[],retirements:[],panels:[],current:()=>isCurrent,emitMediaDiagnosticStage:(...v)=>s.events.push(v),retireQ1Playback:o=>s.retirements.push(o),showMediaError:(...v)=>s.panels.push(v)};
 vm.createContext(s);vm.runInContext(adapter+'\nstopFailure('+JSON.stringify(code)+');',s);
 if(isCurrent){assert.equal(s.state.mediaAttempt,'failed');assert.equal(s.retirements.length,1);assert.equal(s.retirements[0],owner);assert.equal(s.events[0][1].reason,code);assert.equal(s.events[0][1].terminal,true);assert.equal(s.panels.length,1);assert.equal(s.panels[0][1].showRetry,false);assert.equal(s.panels[0][1].title,'원본 재생 확인 필요');}
 else{assert.equal(s.state.mediaAttempt,'q1');assert.equal(s.retirements.length+s.panels.length+s.events.length,0);}
 rows.push({route,code,isCurrent,passed:true,attempt:s.state.mediaAttempt,retirements:s.retirements.length,panels:s.panels.length,automaticRetry:false});
}
// Assert the current event dispatcher sends non-codec errors to this adapter.
const branch=app.slice(app.indexOf("        else if (event.type === 'error')",start),app.indexOf('    owner.player.ready.catch',start));
assert.ok(branch.includes("event.code === 'GENERAL_CODEC_UNQUALIFIED'"));assert.ok(branch.includes('} else stopFailure(event.code);'));
const out={schema:'drive-original.source-change-error-adapter/1',scope:'Controlled current exact app adapter only. Saved Q0/Q1/Q2 source readers prove byte isolation separately; no successful latest-version restart/browser/device claim.',producerSHA256:sha(fs.readFileSync(__filename)),appSHA256:sha(appBytes),adapterSHA256:sha(adapter),adapterLine:app.slice(0,start).split('\n').length,dispatcherNonCodecElseVerified:true,rows,passed:true,network:false,browser:false,modulesImported:false};
fs.writeFileSync(path.join(__dirname,'source-change-discriminator.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({passed:true,controlledCases:rows.length,appSHA256:out.appSHA256}));
