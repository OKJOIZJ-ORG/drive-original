'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
function summarize(r){assert(['drive-original.rc30-performance-continuation/1'].includes(r.schema));assert(r.rows.length<=6);
 const groups={};for(const row of r.rows){const key=[row.route,row.kind,row.cache].join('/');(groups[key]??=[]).push(row);}
 return {binding:r.binding,attempts:r.rows.filter(x=>x.actualAttempt!==false).length,
   actualAttemptCount:r.rows.filter(x=>x.actualAttempt!==false).length,outcomeCount:r.rows.length,requiredOutcomes:6,priorPartialSHA256:r.priorPartialSHA256,originalPlanRemainsIncomplete:true,continuedSamples:[9,10],
   requestedStartupCount:4,requestedSeekCount:2,
   actualStartupAttemptCount:r.rows.filter(x=>x.actualAttempt!==false&&x.kind.endsWith('startup')).length,
   actualSeekAttemptCount:r.rows.filter(x=>x.actualAttempt!==false&&x.kind.startsWith('seek')).length,
   unattemptedCensoredCount:r.rows.filter(x=>x.actualAttempt===false).length,
   planComplete:r.planComplete??r.complete,complete:r.complete,observerReleased:r.observerReleased,
   closedSamples:r.closes.length,closeFailures:r.closes.filter(c=>!c.released).length,
   groups:Object.entries(groups).map(([group,rows])=>{const successful=rows.filter(x=>x.code==='TARGET_FRAME'),values=rows.map(x=>x.code==='TARGET_FRAME'?x.firstFrameMs:Infinity).sort((a,b)=>a-b),p=values[Math.ceil(.95*values.length)-1];
     const first=rows[0],target=first.kind==='warm-startup'?2000:first.route==='Q0'?first.kind==='first-startup'?5000:3000:null;
     const actual=rows.filter(x=>x.actualAttempt!==false),unattempted=rows.length-actual.length;
     return {group,attempts:actual.length,outcomeCount:rows.length,actualAttemptCount:actual.length,
       successes:successful.length,failures:actual.length-successful.length,unattemptedCensoredCount:unattempted,
       failedOrUnattemptedOutcomes:rows.length-successful.length,codes:rows.map(x=>x.code),
       empiricalP95IncludingFailuresMs:Number.isFinite(p)?p:null,p95Censored:!Number.isFinite(p),designTargetMs:target,
       targetAssessment:target==null?'NO_ADOPTED_ROUTE_TARGET':first.cache.includes('unknown')?'CACHE_CONDITION_UNKNOWN':Number.isFinite(p)&&p<=target?'WITHIN_INITIAL_DESIGN_TARGET':'EXCEEDS_OR_CENSORED',
       empiricalP95RequestedOutcomesIncludingFailuresAndUnattemptedMs:Number.isFinite(p)?p:null,
       p95Denominator:'all requested outcomes in this route/action/cache condition; failed or unattempted outcomes are infinite/censored',
       conditionSampleBelow20:rows.length<20,actualConditionSampleBelow20:actual.length<20,smallSampleUncertainty:true};}),limits:r.limitations};}
module.exports={summarize};if(require.main===module)console.log(JSON.stringify(summarize(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2));
