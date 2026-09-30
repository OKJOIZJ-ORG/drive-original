'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
function summarize(r){assert.equal(r.schema,'drive-original.rc25-performance-passive/1');assert(r.rows.length<=30);
 const groups={};for(const row of r.rows){const key=[row.route,row.kind,row.cache].join('/');(groups[key]??=[]).push(row);}
 return {binding:r.binding,attempts:r.rows.length,complete:r.complete,observerReleased:r.observerReleased,
   closedSamples:r.closes.length,closeFailures:r.closes.filter(c=>!c.released).length,
   groups:Object.entries(groups).map(([group,rows])=>{const successful=rows.filter(x=>x.code==='TARGET_FRAME'),values=rows.map(x=>x.code==='TARGET_FRAME'?x.firstFrameMs:Infinity).sort((a,b)=>a-b),p=values[Math.ceil(.95*values.length)-1];
     const first=rows[0],target=first.kind==='warm-startup'?2000:first.route==='Q0'?first.kind==='first-startup'?5000:3000:null;
     return {group,attempts:rows.length,successes:successful.length,failures:rows.length-successful.length,codes:rows.map(x=>x.code),
       empiricalP95IncludingFailuresMs:Number.isFinite(p)?p:null,p95Censored:!Number.isFinite(p),designTargetMs:target,
       targetAssessment:target==null?'NO_ADOPTED_ROUTE_TARGET':first.cache.includes('unknown')?'CACHE_CONDITION_UNKNOWN':Number.isFinite(p)&&p<=target?'WITHIN_INITIAL_DESIGN_TARGET':'EXCEEDS_OR_CENSORED',
       conditionSampleBelow20:rows.length<20,smallSampleUncertainty:true};}),limits:r.limitations};}
module.exports={summarize};if(require.main===module)console.log(JSON.stringify(summarize(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2));
