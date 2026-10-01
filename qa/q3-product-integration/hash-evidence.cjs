'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const paths=[
 'app.js','index.html','sw.js','scripts/public-files.cjs','media/audio-general-pipeline.mjs','media/general-player.mjs',
 'media/video-q3-input.mjs','media/video-q3-pipeline.mjs','media/video-q3-worker.mjs','media/video-q3-codec.mjs','media/video-q3-codec.wasm','media/video-q3-bridge.c','media/video-q3-codec.LICENSE.txt',
 'scripts/link-video-q3.cjs','scripts/package-video-q3-source.cjs',
 'licenses/video-q3-source-NOTICE.md','licenses/video-q3-source-manifest.json','licenses/video-q3-source.tgz','licenses/index.html',
 'tests/video-q3.test.mjs','tests/video-q3-app.test.js','tests/shell.test.js','tests/sw.test.js','memory/Q3-PRODUCT-20261002.md',
 'qa/q3-browser-execution/synthetic-mpeg4.mp4',
 ...['README.md','fixture.html','fixture.mjs','browser-audit.cjs','browser-320-results.json','browser-640-results.json','browser-first-errno-failure.json',
 'synthetic-640.mp4','output-320.mp4','output-640.mp4','oracle.cjs','oracle-results.json','oracle-first-sar-unknown.json','verify-source.cjs','verify-relink.sh','source-results.json','timing-tests-results.json','shell-tests-results.json','hash-evidence.cjs'].map(x=>'qa/q3-product-integration/'+x)
];
const results=['browser-320-results.json','browser-640-results.json','oracle-results.json','source-results.json'].map(name=>({name,value:JSON.parse(fs.readFileSync(path.join(__dirname,name)))}));
if(results.some(x=>x.value.pass!==true))throw Error('Q3_EVIDENCE_NOT_PASSED');
const timing=JSON.parse(fs.readFileSync(path.join(__dirname,'timing-tests-results.json')));
if(timing.pass!==true||timing.failed!==0)throw Error('Q3_TIMING_EVIDENCE_NOT_PASSED');
const shell=JSON.parse(fs.readFileSync(path.join(__dirname,'shell-tests-results.json')));
if(shell.pass!==true||shell.failed!==0)throw Error('Q3_SHELL_EVIDENCE_NOT_PASSED');
const result={format:1,scope:'Local Q3 product integration; synthetic browser/native oracle and source/relink evidence, no actual-file/device/public acceptance',
 validation:{nativeBrowserCases:results.slice(0,2).reduce((n,x)=>n+x.value.cases.length,0),independentNativeOracles:results[2].value.rows.length,sourceAndSameToolchainRelink:results[3].value.pass,
 timingRegressionTests:timing,
 relatedShellTests:shell,
 reusedBrowserScope:'Final dimension/VP9-level guards passed both fixtures. Rejected-source-abort and strict rational duration admission are separately checked in the23 new tests. The current parser still admits both exact3s fixture clocks; positive browser paths, output and codec bytes are unchanged.'},
 files:paths.map(name=>{const b=fs.readFileSync(path.join(root,name));return{path:name,bytes:b.length,sha256:sha(b)};}),
 excludes:['installed SDK/compiler/cache','relink-check extracted sources/static libraries/output','generic first output duplicate','full Node test logs'],
 next:'Actual approved source/app-choice identity replay, long-form resources/quality/seek/EOF and physical PC/Android qualification'};
fs.writeFileSync(path.join(__dirname,'evidence-manifest.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({files:result.files.length,nativeBrowserCases:result.validation.nativeBrowserCases,independentNativeOracles:result.validation.independentNativeOracles}));
