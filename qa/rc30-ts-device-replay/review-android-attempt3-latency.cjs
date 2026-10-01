'use strict';
// Reads curated numeric evidence and canonical local code only. No private input,
// browser/device connection, media, network request or product mutation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const dir=__dirname,root=path.resolve(dir,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const old='aa46bd083ce8c21f55cf7d9a4759f0d6709188c2',current='4a484e6f839d2e6c3eb83503acb08147362cb011';
const inputName='android-same-file-replay-attempt3-result.json',inputBytes=fs.readFileSync(path.join(dir,inputName));
if(sha(inputBytes)!=='34d419002a1ad6851728ca69a458b511bb6482ccc5e97a5c035974bffb2b0e08')throw Error('FROZEN_ACTUAL_RESULT_DRIFT');
const r=JSON.parse(inputBytes),q=r.steps.find(s=>s.name==='final bounded actual replay journal');
if(!r.completed||!r.cleanupComplete||r.sourceCommit!==old||!q?.phases||q.phases.length!==5)throw Error('ACTUAL_RESULT_SCOPE');
const pcBytes=fs.readFileSync(path.join(dir,'actual-pc-same-ts-replay-summary.json')),pc=JSON.parse(pcBytes);
const numeric=n=>Number.isFinite(n)?n:null;
function phaseReview(p){
 const samples=[...new Map(p.samples.map(s=>[s.at,s])).values()].sort((a,b)=>a.at-b.at),first=p.firstTargetFrame;
 if(!first)throw Error('PRESENTED_TARGET_REQUIRED');
 const same=s=>s.pipeline?.generation===first.generation&&s.sourceGeneration===first.sourceGeneration;
 const active=samples.filter(same),firstWhere=predicate=>active.find(predicate);
 const buffer=firstWhere(s=>s.pipeline.phase==='buffering'),previous=buffer?samples.filter(s=>s.at<buffer.at&&same(s)).at(-1):null;
 const frameAt=p.armedAt+first.elapsedMs;
 const frameStep=r.steps.find(s=>s.name===p.label+' actual native frame and deadline evidence');
 const events=q.events.filter(e=>e.at>=p.armedAt&&e.at<=frameAt+300&&e.generation===first.generation);
 const milestone=predicate=>numeric(firstWhere(predicate)?.at-p.armedAt);
 const gaps=samples.slice(1).map((s,i)=>s.at-samples[i].at),match=pc.phases.find(x=>x.label===p.label);
 return {label:p.label,targetFrameMs:first.elapsedMs,targetDistanceSeconds:first.distanceSeconds,
  deadline15Passed:first.elapsedMs<=15000,diagnostic35Passed:first.elapsedMs<=35000,
  generationFirstObservedMs:numeric(active[0]?.at-p.armedAt),
  bufferingFirstObservedMs:numeric(buffer?.at-p.armedAt),bufferingTransitionBracketMs:buffer?[numeric(previous?.at-p.armedAt),buffer.at-p.armedAt]:null,
  firstAppendSampleMs:milestone(s=>s.pipeline.appends>0),readyFirstSampleMs:milestone(s=>s.pipeline.phase==='ready'),
  nativeReady4FirstSampleMs:milestone(s=>s.native?.ready===4),appendsAtFirstFrameRead:frameStep?.actual?.latest?.pipeline?.appends??null,
  fromBufferingObservationToTargetFrameMs:buffer?first.elapsedMs-(buffer.at-p.armedAt):null,
  bufferingObservationFractionOfTotal:buffer?Math.round((buffer.at-p.armedAt)/first.elapsedMs*1000)/1000:null,
  nativeEventsBeforeTarget:events.map(e=>({type:e.type,elapsedMs:e.at-p.armedAt,trusted:!!e.trusted})),
  sampleCount:p.samples.length,sampleCapReached:p.samples.length===144,maxSampleGapMs:gaps.length?Math.max(...gaps):null,
  fenceFailure:!!p.fenceFailure,resourceTimingAvailable:false,
  pcSingleObservationMs:match?.firstTargetFrame?.elapsedMs??null,
  androidMinusPcSingleObservationMs:match?first.elapsedMs-match.firstTargetFrame.elapsedMs:null};
}
const phases=q.phases.map(phaseReview);
const files=['media/drive-source.mjs','media/ts-player.mjs','media/q1-core.mjs','media/transmux-worker.mjs','media/core-entry.mjs',
 'qa/v2-07b-ts-q1/ts-seek.mjs','qa/v2-07b-ts-q1/seek-bootstrap.mjs'];
const sources=files.map(file=>{const read=commit=>execFileSync('git',['show',commit+':'+file],{cwd:root,maxBuffer:2*1024*1024});
 const prior=read(old),fresh=read(current),local=fs.readFileSync(path.join(root,file));return{file,source30Sha256:sha(prior),source31Sha256:sha(fresh),
  sameBytesBetween30And31:prior.equals(fresh),workingTreeMatches31:local.equals(fresh)};});
if(sources.some(s=>!s.sameBytesBetween30And31||!s.workingTreeMatches31))throw Error('MEDIA_SOURCE_IDENTITY_CHANGED');
const eof=r.steps.find(s=>s.name==='actual original TS native EOF and bounded final window evidence')?.actual?.eof;
const report={schema:'drive-original.android-attempt3-latency-review/1',reviewProducerSha256:sha(fs.readFileSync(__filename)),
 actualExecutionByReview:false,privateInputRead:false,browserDeviceNetworkCallsMade:false,productEdited:false,
 evidence:{androidFile:inputName,androidSha256:sha(inputBytes),androidCompleted:r.completed,cleanupComplete:r.cleanupComplete,
  activeReplayDurationMs:r.replayDurationMs,source30:old,comparedSource31:current,
  pcSummaryFile:'actual-pc-same-ts-replay-summary.json',pcSummarySha256:sha(pcBytes),
  samePrivateTargetQualifiedByOriginalRuns:true,reviewDidNotReadTargetIdentity:true},
 phases,mediaSources:sources,
 codeReferences:[
  {file:'media/drive-source.mjs',lines:[174,188,190,220],contract:'Opening metadata, then preflight→Rangebody→postflight before byte release.'},
  {file:'media/ts-player.mjs',lines:[172,178,189,203,214,220,229],contract:'Probe input handoff, buffering marker, target positioning, append ACK, subsequent suffix read and final stats.'},
  {file:'qa/v2-07b-ts-q1/ts-seek.mjs',lines:[17,88,119,164,194],contract:'Bounded sequential samples and same-probe owned selected-window handoff.'},
  {file:'qa/v2-07b-ts-q1/seek-bootstrap.mjs',lines:[35,47,58,149],contract:'ReadStart and prefix/binding construction; no retained raw-window playback queue.'}
 ],
 confirmed:[
  {code:'DELAY_BEFORE_TARGET_POSITIONING',evidence:'seek50/seek90 native seeking events occur at19710/15905ms; seeked follows79/99ms later and loadeddata/target callback coincides. The long wait precedes those native seek completion events.'},
  {code:'OPENING_REGION_DOMINATES',evidence:'Current TS generations appear by230/327ms forseek50/90, then buffering is first observed16009/12831ms; total target times19799/16002ms. Opening covers approximately81/80 percent of those totals.'},
  {code:'PAGE_SAMPLER_REMAINS_LIVE',evidence:'Maximum distinctpage-samplegap is251–252ms inallfive phases. No multi-second page-telemetry stoppage isobserved. This doesnotmeasure cumulativeparserCPU orisolatedworkerCPU.'},
  {code:'ADDITIONAL_PRE_DECODE_REGION',evidence:'First buffering observation to presented target is3790/3171ms forseek50/90,3253ms nearEOF,4907ms startup and3437ms reopen. First append samples can lag an earlier native event orframe; sampled append timing is not exact.'},
  {code:'FINITE_SUCCESS_WITH_RETAINED_DEADLINES',evidence:'Allfive actualsame-target phases eventuallypresented, native/currentTSendedandEOF completed, metadata before/aftermatched, cleanup succeeded. Seek50/seek90/reopen still fail15s. No target-frame orEOF failure is promoted tosuccessat15s.'},
  {code:'SERIAL_FRESH_FENCED_READ_PATH',evidence:'Everybounded source.read awaitsmetadata preflight, Rangebody, thenmetadata postflight before exposingbytes; open alsoawaitsmetadata. Probe reads head/tail and additionaltargetwindows sequentially.'},
  {code:'SELECTED_WINDOW_SUFFIX_REREAD',evidence:'probe onInput suppliesadmittedhead/selectedwindow tocreateSeekBootstrap and state.probeInputReused=true. Bootstrap construction keeps prefix/bindings/readStart. ts-player subsequentlycallsread fromreadStart in262144-byte intervals instead of consuming the admitted selected-window suffix forinitialworkerinput.'}
 ],
 unknowns:[
  'No per-resource timestamps, Range status/header/body duration, probe-window count, parser CPUduration orworker ACK timing were collected inattempt3. Their exact shares areUNKNOWN.',
  'Source stats are populated atEOF/dispose, not continuously duringopening. Nullsample counters meanunobserved, notzerorequests.',
  'Per-phase samples arebounded/periodic; seek50 reached144records. Firstobserved buffering/appends bracket milestones, notexactinternaltransitiontimes.',
  'PCcomparison isoneearlier same-source/same-private-target observation withdifferentdevice/profile/cache/actiontiming. It isnotstatisticalregressionproof.',
  'The media modules arebyte-identical30to31; app/authchanged in31. These30timings do not prove31performance.',
  'The exact final original frame andaudiofidelity remainUNKNOWN/NOT_TESTED.'
 ],
 candidate:{status:'PROPOSAL_ONLY_NOT_IMPLEMENTED',layer:'Same-generation admitted TS probe input handoff',
  intervention:'Consume the already pre/post-fenced selected-window suffix through the existing bootstrap/worker path before issuing the next nonoverlapping Range. Avoid rereading the same admitted RAP bytes while keeping the original source cursor.',
  whyEarliestNarrowCandidate:'The redundant dataflow is established by canonical code. It can remove fresh network read cycles between probe completion and first append without changing the mandatory contentfence on a new Range or introducing cross-generationcache.',
  limits:'This addresses only part of the3–5s post-probe region. The dominant opening/probe region stillneeds per-stage evidence; expectedmillisecond improvement isUNKNOWN.',
  preservedContracts:['Exact current reader/account/content/checksum/controller/generation fences; reject reader replacement or503recovery mismatch',
   'Existingpre/post metadatafences forevery newRange, atmost1MiBsource.read andatmost64KiBbootstrap/workerpush',
   'Same original source offsets/no overlapping duplicateinput/noholes; original media unmodified; existingTS normalizationonly',
   'Existingworkercredit/ACK/appendsbackpressure,owner cancellationandsettledretirement; boundedownedwindow≤1MiB releasedafterconsumption',
   'No forcedroute, formatdowngrade, auth/grantchange, per-generationretry replenishmentorlonglivedcross-filecache'],
  nextDiscriminator:'Before changingcode, passively partition ordinary same-target opening into metadata/Range header/body/probe CPU and worker ACK/append/seeked intervals with fixedlabels/numbersonly andwithoutbodyclonedrain or extra mediaGET. Then compare a boundedcounterexample/control ifthe handoff isimplemented.'},
 eof:{nativeEnded:!!eof?.nativeEnded,q1Ended:!!eof?.q1Ended,sourceOffsetReachedSize:!!eof?.sourceOffsetReachedSize,
  workerFinished:!!eof?.workerFinished,exactFinalFrame:'UNKNOWN'},
 rawIdentifiersExported:false};
fs.writeFileSync(path.join(dir,'android-attempt3-latency-review.json'),JSON.stringify(report,null,2)+'\n');
const rows=phases.map(p=>`| ${p.label} | ${(p.targetFrameMs/1000).toFixed(3)} | ${p.bufferingFirstObservedMs===null?'unknown':(p.bufferingFirstObservedMs/1000).toFixed(3)} | ${p.deadline15Passed?'pass':'fail'} |`).join('\n');
const md=`# Android attempt3 latency review\n\nSame-file source30 functional replay completed and cleanup settled. Seek50, seek90 and reopen retain their15s failures. This review performed no device/browser/network operation and changed no product.\n\n| Phase | Presented target seconds | Buffering first observed seconds | 15s |\n|---|---:|---:|---|\n${rows}\n\nThe decisive latency region is before target positioning: seek50/90 enter the current TSgeneration within0.230/0.327s, but buffering first appears at16.009/12.831s. Native seeking→seeked itself is only79/99ms. Loadeddata coincides with the eventual presented target, so a fast already-presented target hidden by delayed UI readiness is not supported by this attempt. Sample milestones are periodic observations, not exact append timestamps.\n\nNo resource header/body timings, probe-window count or parser/worker CPU duration was recorded. Network/Drive latency versus parser/worker work therefore remains unknown. The code establishes a serial metadata-preflight→Rangebody→metadata-postflight path for every read, including repeated sequential head/tail/target discovery. Media sources are byte-identical between source30aa46bd0 and source31${current.slice(0,7)}; the app/auth layer changed, so source30 timings are not source31 proof.\n\nA narrow candidate is to pass the already admitted same-generation selected-window suffix to the existing bootstrap/worker path instead of rereading it from bootstrap.readStart. Current probe reuse supplies bootstrap construction, but the subsequent playback loop fetches those source offsets again. Preserve current reader/content/account/generation/checksum fences, ≤1MiB source reads, ≤64KiB pushes, credits/ACK backpressure, original offsets and cleanup; release bounded owned bytes and reject reader replacement. This structural redundancy is proven by code, but its actual time cost is unknown. It addresses only part of the3–5s after probing, while the larger opening region needs passive per-stage timestamps first. No implementation is proposed from an assumed network cause.\n\nThe earlier PC same-file observation is a single different-device/profile run: startup14.160s, seek5014.305s, nearEOF9.601s, reopen12.885s. It provides context, not statistical regression evidence. Exact last original frame and audiofidelity remain unknown/not tested.\n\nEvidence: android-same-file-replay-attempt3-result.json SHA256${sha(inputBytes)}; producer and source hashes are in the JSON review. Relevant canonical code: media/drive-source.mjs readMeta/read; media/ts-player.mjs probeTsSeek/onInput/positionTarget/workerloop; qa/v2-07b-ts-q1/ts-seek.mjs sample andedge/targetsearch; seek-bootstrap.mjs configuration/readStart.\n`;
fs.writeFileSync(path.join(dir,'android-attempt3-latency-review.md'),md);
console.log(JSON.stringify({phases:phases.map(p=>({label:p.label,targetFrameMs:p.targetFrameMs,bufferingFirstObservedMs:p.bufferingFirstObservedMs,deadline15Passed:p.deadline15Passed})),
 files:['android-attempt3-latency-review.json','android-attempt3-latency-review.md'].map(name=>{const b=fs.readFileSync(path.join(dir,name));return{name,bytes:b.length,sha256:sha(b)};}),allMediaSourcesIdentical:sources.every(s=>s.sameBytesBetween30And31)},null,2));
