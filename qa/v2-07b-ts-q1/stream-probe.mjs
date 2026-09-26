import { readFileSync,writeFileSync,mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createGopStream } from './gop-stream.mjs';
import { analyzeGopBoundaries } from './gop-boundaries.mjs';
const require=createRequire(import.meta.url);
const bundlePath=require.resolve('mux.js/dist/mux-mp4.min.js');
const {Transmuxer}=require(bundlePath);
const {transmuxAtCuts,initTracks}=require('./incremental-probe.cjs');
const root=fileURLToPath(new URL('.',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const demand=(value)=>{if(!value)throw new Error('STREAM_PROBE_FAILED');};

function run(){
  const fixture=readFileSync(path.join(root,'synthetic-bframes-audiolead.ts'));
  demand(sha(fixture)==='e05388c5f61b181710145a414443938e8065dd08e77e01c0aec0ffd0b73229e4');
  const priorBytes=readFileSync(path.join(root,'incremental-results.redacted.json'));
  const prior=JSON.parse(priorBytes);
  demand(prior.library?.name==='mux.js'&&prior.library.version==='7.1.0'&&prior.library.artifact==='dist/mux-mp4.min.js'
    &&require('mux.js/package.json').version==='7.1.0'&&prior.library.sha256===sha(readFileSync(bundlePath))
    &&prior.library.sha256==='4d00d911c3186ca8921b8710de24cf4c4ea854e47c59d3c5164779ba83a2805f');
  demand(prior.fixture?.sha256===sha(fixture)&&prior.fixture.bytes===fixture.length);
  const sources={};
  for(const name of ['stream-probe.mjs','gop-stream.mjs','elementary-stream.mjs','psi-stream.mjs','gop-boundaries.mjs',
    '../v2-07a-container-probe/mpeg-ts-probe.mjs','incremental-probe.cjs','preservation-probe.cjs','synthetic-variants.mjs','package-lock.json']){
    sources[name]=sha(readFileSync(path.join(root,name)));
  }
  demand(prior.discriminated&&prior.observations.find(row=>row.name==='before-verified-idr')?.preserved===true);
  for(const [key,name]of Object.entries({driverSha256:'incremental-probe.cjs',boundarySha256:'gop-boundaries.mjs',
    containerProbeSha256:'../v2-07a-container-probe/mpeg-ts-probe.mjs',comparisonSha256:'preservation-probe.cjs',
    variantSha256:'synthetic-variants.mjs',lockSha256:'package-lock.json'}))demand(prior.producer[key]===sources[name]);
  const baseline=transmuxAtCuts(fixture,analyzeGopBoundaries(fixture).cuts);
  const strictOutput=prior.observations.find(row=>row.name==='before-verified-idr');
  demand(strictOutput.outputSha256===sha(baseline.bytes)&&strictOutput.outputBytes===baseline.bytes.length);
  const observations=[];
  for(const chunkBytes of [1,187,188,189,4093,65536]){
    const mux=new Transmuxer({remux:true,keepOriginalTimestamps:true});
    let init=null,sourceDelivered=0,firstCallbackInputBytes=null;
    const output=[],intervals=[],raw=[];
    mux.on('data',segment=>{
      demand(segment.type==='combined');const next=Buffer.from(segment.initSegment);initTracks(next);
      if(init)demand(init.equals(next));else{init=next;output.push(init);}
      output.push(Buffer.from(segment.data));
    });
    const owner=createGopStream({maxWindowBytes:188*900,maxLookaheadBytes:188*128,maxPesBytes:32768,onInterval:item=>{
      if(firstCallbackInputBytes===null)firstCallbackInputBytes=sourceDelivered;
      intervals.push({start:item.start,end:item.end,final:item.final,videoFrames:item.proof.videoFrames,aacFrames:item.proof.aacFrames});
      raw.push(Buffer.from(item.bytes));mux.push(item.bytes);mux.flush();
    }});
    for(let offset=0;offset<fixture.length;offset+=chunkBytes){sourceDelivered=Math.min(offset+chunkBytes,fixture.length);owner.push(fixture.subarray(offset,sourceDelivered));}
    const intervalsBeforeEof=intervals.length;owner.finish({sourceSize:fixture.length});
    const stats=owner.stats();const bytes=Buffer.concat(output);
    const sourceBytesEqual=Buffer.concat(raw).equals(fixture);const verifiedMuxBytesEqual=bytes.equals(baseline.bytes);
    demand(sourceBytesEqual&&verifiedMuxBytesEqual&&intervalsBeforeEof===5&&intervals.length===6
      &&firstCallbackInputBytes<fixture.length/3&&stats.state==='finished'&&stats.retainedBytes===0
      &&stats.peakRetainedBytes<=stats.storageCapacity+188&&stats.peakOwnedByteStorage<500000);
    observations.push({chunkBytes,firstCallbackInputBytes,intervalsBeforeEof,sourceBytesEqual,verifiedMuxBytesEqual,
      outputBytes:bytes.length,outputSha256:sha(bytes),intervals,stats});
  }
  const report={schema:'drive-original.q1-stream-owner/1',recordedAt:new Date().toISOString(),
    fixture:{sha256:sha(fixture),bytes:fixture.length},library:{name:'mux.js',version:'7.1.0',artifact:'dist/mux-mp4.min.js',sha256:sha(readFileSync(bundlePath))},
    producer:{sources,node:process.version},comparisonReportSha256:sha(priorBytes),observations,
    limitations:['QA-only public generated fixture, not adopted/deployed product code','fixture and comparison outputs loaded/retained by test harness, excluded from owner accounting',
      'encoded owner byte storage accounting, not total JS heap/mux cache/decoder/worker/MSE memory',
      'structural eligibility is not complete-picture/error-free decode proof; equality links only this fixture to prior strict decoder evidence',
      'initial CFR, fixed topology, no cross-PES ADTS, no cross-IDR presentation reorder; not full-format support',
      'synchronous sink only; no network/Drive identity, worker backpressure, indexed seek, duration discovery, MSE/MMS or device proof']};
  const directory=mkdtempSync(path.join(root,'run-stream-'));
  writeFileSync(path.join(directory,'results.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  process.stdout.write(JSON.stringify({report:path.relative(root,path.join(directory,'results.json')),observations:observations.map(row=>({chunkBytes:row.chunkBytes,
    firstCallbackInputBytes:row.firstCallbackInputBytes,peakRetainedBytes:row.stats.peakRetainedBytes,accountedBytes:row.stats.peakOwnedByteStorage,outputBytesEqual:row.verifiedMuxBytesEqual}))})+'\n');
}
try{run();}catch{process.stderr.write('Stream owner probe failed; no product success recorded.\n');process.exitCode=1;}
