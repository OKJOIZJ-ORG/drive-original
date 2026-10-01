import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {shortEof} from './fixture.mjs';
import {probeTsSeek} from '../../media/q1-core.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const baseline=execFileSync('git',['show','10f1dd2ee9550866933e693dbf41c62e1fb2daad:media/q1-core.mjs'],{cwd:root});
const before=await import('data:text/javascript;base64,'+baseline.toString('base64')),results=[];
for(const count of [1,2]){
 const bytes=shortEof(count),options={sourceSize:bytes.length,read:async({start,end})=>bytes.subarray(start,end+1)};
 for(const positionSeconds of [0,1e6]){
  let failure=null;try{await before.probeTsSeek({...options,positionSeconds});}catch(error){failure=error.message;}
  assert.equal(failure,'SEEK_GOP_PRESENTATION_UNPROVEN');
  const plan=await probeTsSeek({...options,positionSeconds});
  assert.ok(plan.local.before.pts<=plan.targetTicks&&plan.local.after.pts>=plan.targetTicks);
  results.push({shortEofFrames:count,target:positionSeconds?'last-picture':'startup',baselineFailure:failure,
   rebuiltCorePass:true,observedAnchorBracket:true,finalDurationInferred:plan.timeline.finalVideoDurationInferred,
   sourceGlobalContinuityVerified:plan.timeline.globalContinuityVerified,reads:plan.windows.length,readBytes:plan.readBytes});
 }
}
writeFileSync(new URL('./baseline-results.json',import.meta.url),JSON.stringify({baselineSourceCommit:'10f1dd2ee9550866933e693dbf41c62e1fb2daad',baselineCoreSHA256:createHash('sha256').update(baseline).digest('hex'),results},null,2)+'\n');
console.log(JSON.stringify({baselineFailures:results.length,rebuiltPasses:results.length}));
