'use strict';
const fs=require('node:fs'),path=require('node:path'),here=__dirname;
function derive(input,output,changes){let s=fs.readFileSync(path.join(here,input),'utf8');for(const[a,b]of changes){if(!s.includes(a))throw Error('TUPLE_PREPARATION_ANCHOR');s=s.replaceAll(a,b);}fs.writeFileSync(path.join(here,output),s);}
const oldFailure="if(stats.failure||!result.generationQualified||!result.sourceDeclarationAbsent||!result.observedOutputQualified||result.comparison&&['nativeLayoutExact','nativePlanesExact','colorSpaceExact'].some(k=>result.comparison[k]!==true))throw Error('COLOR_INTERPRETATION_UNQUALIFIED');";
derive('android-color-observer.function.js','android-tuple-observer.function.js',[
 ["Math.abs(m.mediaTime-pts)>.0001","Math.abs(m.mediaTime-pts)>.015"],
 ["const binding=await(await fetch('/binding')).json();report.binding=binding;","const binding=await(await fetch('/binding')).json();report.binding=binding;report.predeclaredPredicate=binding.predicate;if(binding.predicate?.scope!=='tuple-propagation-and-seek')throw Error('TUPLE_PREDICATE_REQUIRED');"],
 ["if(!observation)throw Error('COLOR_NATIVE_OBSERVATION_UNAVAILABLE');","if(!observation||observation.format!=='I420'||observation.visibleRect.width!==320||observation.visibleRect.height!==180)throw Error('TUPLE_NATIVE_OBSERVATION_UNQUALIFIED');"],
 ["[{label:'last-frame',target:5.999999,packetPTS:5.958333333333333},\n      {label:'back-seek',target:2,packetPTS:2},{label:'last-frame-return',target:5.999999,packetPTS:5.958333333333333}]","[{label:'initial2-fresh-owner-setup',target:2,packetPTS:2},{label:'successor-last-frame',target:5.999999,packetPTS:5.958333333333333}]"],
 [oldFailure,"const keys=['primaries','transfer','matrix','fullRange'],observed=report.observation.colorSpace;result.outputConfigTupleExact=keys.every(k=>stats.pipeline?.outputVideoConfig?.colorSpace?.[k]===observed[k]);result.outputObservationTupleExact=keys.every(k=>stats.outputColorObservation?.colorSpace?.[k]===observed[k]);result.presentedTupleExact=keys.every(k=>image.colorSpace[k]===observed[k]);result.visibleGeometryExact=image.visibleRect.width===320&&image.visibleRect.height===180;result.mappedTargetDistanceMs=Math.abs(image.frame.mediaTime-(item.packetPTS-mapping.commonShift))*1000;result.previousOwnersRetired=report.sources.slice(0,-1).every(s=>!s.active&&s.activeReads===0&&s.aborts===1)&&report.workers.slice(0,-1).every(w=>w.terminated);result.unlikeFormatVisibleYUV='UNKNOWN';result.tuplePropagationPass=!stats.failure&&result.generationQualified&&result.sourceDeclarationAbsent&&result.observedOutputQualified&&result.outputConfigTupleExact&&result.outputObservationTupleExact&&result.presentedTupleExact&&result.visibleGeometryExact&&result.mappedTargetDistanceMs<=15&&result.previousOwnersRetired;if(!result.tuplePropagationPass)throw Error('TUPLE_PROPAGATION_UNQUALIFIED');"],
 ["report.observedPass=true;report.strictRgbaPass=!report.strictRgbaFailure;","report.observedPass=true;report.tuplePropagationPass=true;report.strictRgbaPass=!report.strictRgbaFailure;"],
 ["schema:'observed-native-color-player/1'","schema:'android-tuple-propagation-and-seek/1'"],
 ["scope:'Generated fixture, actual native file observation and Q1 worker/MSE output; no Drive account or original media mutation.'","scope:'Actual Android generated fixture; native observed color tuple propagation and serial seek only. No pixel fidelity equivalence. Initial2 is fresh-owner setup then successor last-frame, generations1/2.'"]
]);
derive('android-color-server.cjs','android-tuple-server.cjs',[
 ["android-color-observer.function.js","android-tuple-observer.function.js"],
 ["const binding={source:","const binding={predicate:JSON.parse(fs.readFileSync(path.join(__dirname,'android-tuple-predicate.json'))),source:"]
]);
derive('android-color-driver.cjs','android-tuple-driver.cjs',[
 ["android-color-server.cjs","android-tuple-server.cjs"],["android-color-actual-result.json","android-tuple-actual-result.json"],
 ["schema:'actual-android-controlled-color/1'","schema:'actual-android-tuple-propagation/1'"],
 ["Programmatic controlled player/seek, not native finger or app UI, no candidate/account state reads or writes.","Programmatic tuple propagation/serial seek only, not pixel fidelity, native finger or app UI, no candidate/account state reads or writes."],
 ["producerSha256:sha(fs.readFileSync(__filename)),binding:owned.binding","producerSha256:sha(fs.readFileSync(__filename)),predeclaredPredicate:owned.binding.predicate,binding:owned.binding"],
 ["owned controlled color unit begins","owned predeclared tuple-propagation unit begins"]
]);
