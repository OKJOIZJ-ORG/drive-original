// Offline validation of the retained synthetic execution and exact evidence bytes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),read=n=>JSON.parse(fs.readFileSync(path.join(__dirname,n))),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const evidence=read('evidence-manifest.json');
for(const row of evidence.files){const b=fs.readFileSync(path.join(root,row.path));if(b.length!==row.bytes||sha(b)!==row.sha256)throw Error('Q3_EVIDENCE_HASH:'+row.path);}
const browser=read('browser-results.json'),oracle=read('oracle-results.json'),build=read('build-resource-results.json'),memory=read('codec-memory-results.json');
if(!build.pass||build.exit!==0||build.signal||build.terminated.length||build.samples.some(s=>s.commitAvailableGiB<400/1024))throw Error('Q3_BUILD_RECORD');
if(!browser.pass||browser.native.error!==4||browser.sourceCapability.codec!=='mp4v.20.1'||browser.sourceCapability.decoder!==false||browser.cases.length!==3||browser.cases.some(c=>!c.pass||!c.observed.closed||c.observed.workerCount!==0))throw Error('Q3_BROWSER_RECORD');
if(!oracle.pass||oracle.rows.length!==2||oracle.rows.some(r=>!r.pass||!r.metadataAndCadencePass||r.maxTimestampErrorSeconds>0.000501||r.codec!=='vp9'||r.psnrAllYuv<38||r.minimumFramePsnr<33))throw Error('Q3_ORACLE_RECORD');
for(const row of oracle.rows)if(row.sha256!==sha(fs.readFileSync(path.join(__dirname,row.name))))throw Error('Q3_ORACLE_OUTPUT_HASH');
if(oracle.producerSha256!==sha(fs.readFileSync(path.join(__dirname,'oracle.cjs')))||oracle.sourceSha256!==sha(fs.readFileSync(path.join(__dirname,'synthetic-mpeg4.mp4'))))throw Error('Q3_ORACLE_PRODUCER');
if(!memory.pass||memory.memory.initialBytes!==33554432||memory.memory.maximumBytes!==67108864||memory.sha256!==sha(fs.readFileSync(path.join(__dirname,'codec.wasm'))))throw Error('Q3_CODEC_MEMORY_RECORD');
console.log(JSON.stringify({pass:true,files:evidence.files.length,browserCases:browser.cases.length,oracleCases:oracle.rows.length,scope:'Synthetic local-only Q3 feasibility; no corpus, device or product acceptance'}));
