'use strict';
// Explicit read-only private original; no source path, fingerprint, frame/hash,
// identifier, stderr, or derivative survives in this redacted report.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'q1-priority');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const demand=(value,code)=>{if(!value)throw new Error(code);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const identity=stat=>({size:stat.size,mtimeMs:stat.mtimeMs,ino:stat.ino,dev:stat.dev});
const report={passed:false,recordedAt:new Date().toISOString(),sourceLabel:'priority-sample-1',originalWrites:0,
  currentDriveIdentityVerified:false,strictDiagnostics:true,stages:[],
  scope:'Full-source local native QA; canonical source session bound to product build manifest, not real Drive/browser/device proof. Native commands reread original. Transmux forward pass uses64KiB inputs; timing arrays capped at1M rows and native subprocess memory are QA-only, not product heap evidence.'};
let input=null,before=null,expectedHash=null,derivative=null,derivativeCreated=false,fd=null,outputFd=null,bootstrap=null,session=null,stage='expectation';
async function fingerprint(file){const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file,{highWaterMark:65536}))hash.update(chunk);return hash.digest('hex');}
function statFence(){demand(same(identity(fs.statSync(input)),before),'PRIORITY_SOURCE_DRIFT');}
function native(file,args,consume){return new Promise((resolve,reject)=>{
  let diagnostics=0,failed=null;
  const child=spawn(args[0],['-v','error',...args.slice(1),file],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const timer=setTimeout(()=>{failed='PRIORITY_NATIVE_TIMEOUT';child.kill();},300000);
  child.on('error',()=>{failed='PRIORITY_NATIVE_START';});
  child.stderr.on('data',chunk=>{diagnostics+=chunk.length;});
  child.stdout.on('data',chunk=>{try{consume(chunk);}catch{failed='PRIORITY_NATIVE_OUTPUT';child.kill();}});
  child.on('close',code=>{clearTimeout(timer);if(failed||code!==0||diagnostics)reject(new Error(failed||(diagnostics?'PRIORITY_NATIVE_DIAGNOSTIC':'PRIORITY_NATIVE_EXIT')));else resolve();});
});}
// ffmpeg input must precede output flags; keep file arguments entirely private.
function ffmpeg(file,flags,consume){return new Promise((resolve,reject)=>{
  let diagnostics=0,failed=null;
  const child=spawn('ffmpeg',['-v','error','-nostdin','-threads','1','-i',file,...flags,'pipe:1'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const timer=setTimeout(()=>{failed='PRIORITY_NATIVE_TIMEOUT';child.kill();},300000);
  child.on('error',()=>{failed='PRIORITY_NATIVE_START';});child.stderr.on('data',chunk=>{diagnostics+=chunk.length;});
  child.stdout.on('data',chunk=>{try{consume(chunk);}catch{failed='PRIORITY_NATIVE_OUTPUT';child.kill();}});
  child.on('close',code=>{clearTimeout(timer);if(failed||code!==0||diagnostics)reject(new Error(failed||(diagnostics?'PRIORITY_NATIVE_DIAGNOSTIC':'PRIORITY_NATIVE_EXIT')));else resolve();});
});}
function lines(accept){let tail='';return {push(chunk){tail+=chunk.toString('utf8');demand(tail.length<1024*1024,'PRIORITY_LINE_LIMIT');
  let end;while((end=tail.indexOf('\n'))>=0){accept(tail.slice(0,end).trim());tail=tail.slice(end+1);}},finish(){if(tail.trim())accept(tail.trim());}};}
async function metadata(file){const chunks=[];let length=0;
  await native(file,['ffprobe','-show_entries','stream=index,codec_type,codec_name,profile,level,width,height,pix_fmt,sample_aspect_ratio,color_range,color_space,color_transfer,color_primaries,sample_rate,channels,channel_layout','-of','json'],chunk=>{
    length+=chunk.length;demand(length<=1048576,'PRIORITY_METADATA_LIMIT');chunks.push(chunk);
  });
  const streams=JSON.parse(Buffer.concat(chunks)).streams;
  demand(streams.length===2&&streams.filter(row=>row.codec_type==='video'&&row.codec_name==='h264').length===1
    &&streams.filter(row=>row.codec_type==='audio'&&row.codec_name==='aac').length===1,'PRIORITY_TRACKS');
  return streams.sort((a,b)=>a.codec_type.localeCompare(b.codec_type));
}
async function packets(file,streams){const result={video:[],audio:[]};let count=0;
  const parser=lines(line=>{if(!line)return;const fields=Object.fromEntries(line.split('|').map(field=>field.split('=')));
    if(fields.stream_index===undefined)return;
    const kind=streams.find(row=>row.index===Number(fields.stream_index))?.codec_type;
    const row=['pts_time','dts_time','duration_time'].map(key=>Number(fields[key]));
    demand(kind&&row.every(Number.isFinite)&&++count<=1000000,'PRIORITY_TIMING_LIMIT');result[kind].push(row);
  });
  await native(file,['ffprobe','-show_packets','-show_entries','packet=stream_index,pts_time,dts_time,duration_time','-of','compact=p=0:nk=0'],chunk=>parser.push(chunk));parser.finish();return result;
}
function sequence(){const hash=createHash('sha256');let count=0;return {add(value){hash.update(`${value.length}:`);hash.update(value);count++;},end(){return {count,hash:hash.digest('hex')};}};}
async function nals(file){let tail=Buffer.alloc(0);const vcl=sequence(),sei=sequence(),parameters=new Set();
  function take(bytes){while(bytes.length&&bytes.at(-1)===0)bytes=bytes.subarray(0,-1);demand(bytes.length,'PRIORITY_NAL');
    const type=bytes[0]&31;if([1,2,3,4,5].includes(type))vcl.add(bytes);if(type===6)sei.add(bytes);if(type===7||type===8)parameters.add(sha(bytes));}
  function starts(bytes){const found=[];for(let i=0;i+2<bytes.length;i++){
    if(bytes[i]===0&&bytes[i+1]===0&&bytes[i+2]===1){found.push([i,i+3]);i+=2;}
    else if(i+3<bytes.length&&bytes[i]===0&&bytes[i+1]===0&&bytes[i+2]===0&&bytes[i+3]===1){found.push([i,i+4]);i+=3;}
  }return found;}
  await ffmpeg(file,['-map','0:v:0','-c:v','copy','-bsf:v','h264_mp4toannexb','-f','h264'],chunk=>{
    tail=Buffer.concat([tail,chunk]);demand(tail.length<=2*1024*1024,'PRIORITY_NAL_LIMIT');const list=starts(tail);
    for(let i=0;i+1<list.length;i++)take(tail.subarray(list[i][1],list[i+1][0]));if(list.length>1)tail=tail.subarray(list.at(-1)[0]);
  });
  const final=starts(tail);demand(final.length===1,'PRIORITY_NAL_END');take(tail.subarray(final[0][1]));
  return {vcl:vcl.end(),sei:sei.end(),parameters:[...parameters].sort()};
}
async function aac(file){let tail=Buffer.alloc(0);const seq=sequence();
  await ffmpeg(file,['-map','0:a:0','-c:a','copy','-f','adts'],chunk=>{
    tail=Buffer.concat([tail,chunk]);let position=0;
    while(position+7<=tail.length){const bytes=tail.subarray(position);demand(bytes[0]===255&&(bytes[1]&246)===240,'PRIORITY_ADTS');
      const header=bytes[1]&1?7:9,length=((bytes[3]&3)<<11)|(bytes[4]<<3)|(bytes[5]>>5);
      demand(length>header&&(bytes[6]&3)===0,'PRIORITY_ADTS');if(length>bytes.length)break;
      seq.add(bytes.subarray(header,length));position+=length;
    }tail=tail.subarray(position);demand(tail.length<8192,'PRIORITY_ADTS_LIMIT');
  });demand(tail.length===0,'PRIORITY_ADTS_END');return seq.end();
}
async function frames(file){const seq=sequence();const parser=lines(line=>{if(!line||line.startsWith('#'))return;
  const row=line.split(',').map(value=>value.trim());demand(row.length===6&&/^[a-f0-9]{64}$/.test(row[5]),'PRIORITY_FRAME_HASH');
  seq.add(Buffer.from(`${row[4]}:${row[5]}`));
  });await ffmpeg(file,['-map','0:v:0','-an','-vf','format=yuv420p','-fps_mode','passthrough','-f','framehash','-hash','sha256'],chunk=>parser.push(chunk));parser.finish();return seq.end();}
async function pcm(file){const hash=createHash('sha256');let bytes=0;await ffmpeg(file,['-map','0:a:0','-vn','-c:a','pcm_s16le','-f','s16le'],chunk=>{bytes+=chunk.length;hash.update(chunk);});return {bytes,hash:hash.digest('hex')};}
function note(name){stage=name;console.log(JSON.stringify({stage:name}));}
(async()=>{
  demand(process.argv[2]&&path.resolve(process.argv[2])===path.join(__dirname,'player-stage-v2-01c/private-sample.json'),'PRIORITY_EXPECTATION');
  const expected=JSON.parse(fs.readFileSync(process.argv[2]));input=expected.localPath;
  demand(typeof input==='string'&&path.isAbsolute(input),'PRIORITY_EXPECTATION');before=identity(fs.statSync(input));
  demand(before.size===Number(expected.drive.size)&&Number.isSafeInteger(before.size),'PRIORITY_SIZE');expectedHash=expected.localBytes.sha256.toLowerCase();
  demand(/^[a-f0-9]{64}$/.test(expectedHash),'PRIORITY_EXPECTATION');
  note('initial-source-fence');demand(await fingerprint(input)===expectedHash,'PRIORITY_FINGERPRINT');statFence();report.initialFingerprintMatched=true;
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'media/build.json'))),sources={};
  for(const [file,record]of Object.entries(manifest.outputs)){
    demand(sha(fs.readFileSync(path.join(root,file)))===record.sha256,'PRIORITY_BUNDLE_DRIFT');sources[file]=record.sha256;
    for(const [name,hash]of Object.entries(record.inputs)){demand(sha(fs.readFileSync(path.join(root,name)))===hash,'PRIORITY_PRODUCER_DRIFT');sources[name]=hash;}
  }
  for(const file of ['qa/q1-priority-preservation-audit.cjs','media/build.json','media/mux-mp4.min.js'])sources[file]=sha(fs.readFileSync(path.join(root,file)));
  demand(sources['media/mux-mp4.min.js']==='4d00d911c3186ca8921b8710de24cf4c4ea854e47c59d3c5164779ba83a2805f','PRIORITY_MUX');report.sources=sources;
  const {probeTsSeek,createSeekBootstrap}=await import('../media/q1-core.mjs');
  const {createTransmuxSession}=await import('./v2-07b-ts-q1/transmux-session.mjs');
  const {Transmuxer}=require('./v2-07b-ts-q1/node_modules/mux.js/dist/mux-mp4.min.js');
  demand(sha(fs.readFileSync(require.resolve('./v2-07b-ts-q1/node_modules/mux.js/dist/mux-mp4.min.js')))===sources['media/mux-mp4.min.js'],'PRIORITY_MUX');
  fd=fs.openSync(input,'r');const read=async({start,end})=>{statFence();demand(end-start+1<=1048576,'PRIORITY_READ_LIMIT');
    const bytes=new Uint8Array(end-start+1);demand(fs.readSync(fd,bytes,0,bytes.length,start)===bytes.length,'PRIORITY_SHORT_READ');return bytes;};
  note('bounded-initial-plan');const plan=await probeTsSeek({read,sourceSize:before.size,positionSeconds:0});
  bootstrap=createSeekBootstrap({generation:1,headBytes:await read({start:0,end:Math.floor(65536/188)*188-1}),
    bytes:await read({start:plan.local.windowStart,end:plan.local.windowEndExclusive-1}),offset:plan.local.windowStart,plan});
  fs.mkdirSync(out,{recursive:true});derivative=path.join(out,`native-owned-${process.pid}-${Date.now()}.mp4`);outputFd=fs.openSync(derivative,'wx');derivativeCreated=true;
  let outputBytes=0,sequenceNumber=0,offered=0,sessionError=null,detached=0,fragmentCount=0;
  session=createTransmuxSession({generation:1,sourceSize:bootstrap.outputSize,Transmuxer,send(message,transfers){
    if(message.type==='error'){sessionError=message.code;return;}
    if(message.type==='fragment'){
      const copied=structuredClone(message,{transfer:transfers});demand(message.bytes.byteLength===0,'PRIORITY_TRANSFER');detached++;
      const bytes=Buffer.from(copied.bytes);demand(fs.writeSync(outputFd,bytes)===bytes.length,'PRIORITY_OUTPUT_WRITE');outputBytes+=bytes.length;fragmentCount++;
      session.receive({type:'ack',generation:1,fragmentSequence:copied.fragmentSequence});
    }
  }});
  note('full-forward-transmux');
  const chunk=Buffer.alloc(65536);let readBytes=0;
  for(let position=bootstrap.readStart;position<before.size;){
    const length=Math.min(chunk.length,before.size-position);demand(fs.readSync(fd,chunk,0,length,position)===length,'PRIORITY_SHORT_READ');readBytes+=length;
    const transformed=bootstrap.push(chunk.subarray(0,length),{offset:position,generation:1});
    for(let cursor=0;cursor<transformed.length;cursor+=65536){const bytes=Uint8Array.from(transformed.subarray(cursor,cursor+65536)).buffer;
      session.receive({type:'input',generation:1,sequence:++sequenceNumber,offset:offered,bytes});offered+=bytes.byteLength;
      demand(!sessionError,sessionError||'PRIORITY_SESSION');
    }position+=length;
  }
  bootstrap.finish({sourceSize:before.size,generation:1});session.receive({type:'eof',generation:1});demand(session.stats().state==='finished',sessionError||'PRIORITY_SESSION');
  fs.closeSync(outputFd);outputFd=null;fs.closeSync(fd);fd=null;statFence();
  report.transmux={complete:true,readBytes,outputBytes,fragments:fragmentCount,detached,bootstrap:bootstrap.stats(),session:session.stats()};
  note('metadata-and-absolute-timing');const sourceMeta=await metadata(input),outputMeta=await metadata(derivative);
  const strip=rows=>rows.map(({index,...row})=>row);report.metadataEqual=same(strip(sourceMeta),strip(outputMeta));demand(report.metadataEqual,'PRIORITY_METADATA_DIFFERENCE');
  const sourcePackets=await packets(input,sourceMeta),outputPackets=await packets(derivative,outputMeta);report.timing=[];
  for(const kind of ['video','audio']){const a=sourcePackets[kind],b=outputPackets[kind],max=[0,0,0];demand(a.length>0&&a.length===b.length,'PRIORITY_PACKET_COUNT');
    for(let i=0;i<a.length;i++)for(let n=0;n<3;n++)max[n]=Math.max(max[n],Math.abs(a[i][n]-b[i][n]));
    const tolerance=1/(kind==='video'?90000:Number(sourceMeta.find(row=>row.codec_type==='audio').sample_rate))+.000002;
    report.timing.push({kind,packets:a.length,maximumAbsoluteDelta:max,tolerance,preserved:max.every(value=>value<=tolerance)});
    demand(max.every(value=>value<=tolerance),'PRIORITY_ABSOLUTE_TIMING');
  }
  note('coded-video');const sourceNals=await nals(input),outputNals=await nals(derivative);report.codedVideoEqual=same(sourceNals,outputNals);demand(report.codedVideoEqual,'PRIORITY_CODED_VIDEO');
  note('coded-audio');const sourceAac=await aac(input),outputAac=await aac(derivative);report.codedAudioEqual=same(sourceAac,outputAac);demand(report.codedAudioEqual,'PRIORITY_CODED_AUDIO');
  note('decoded-video');const sourceFrames=await frames(input),outputFrames=await frames(derivative);report.allDecodedVideoEqual=sourceFrames.count>0&&same(sourceFrames,outputFrames);demand(report.allDecodedVideoEqual,'PRIORITY_DECODED_VIDEO');
  note('decoded-pcm');const sourcePcm=await pcm(input),outputPcm=await pcm(derivative);report.fullSameStartPcmEqual=sourcePcm.bytes>0&&same(sourcePcm,outputPcm);demand(report.fullSameStartPcmEqual,'PRIORITY_DECODED_PCM');
  for(const [file,hash]of Object.entries(sources))demand(sha(fs.readFileSync(path.join(root,file)))===hash,'PRIORITY_PRODUCER_DRIFT');
  report.passed=true;
})().catch(error=>{report.failure={stage,code:/^[A-Z][A-Z0-9_]+$/.test(error?.message)?error.message:'PRIORITY_AUDIT_FAILED'};process.exitCode=1;}).finally(async()=>{
  if(session&&session.stats().state==='open')session.receive({type:'abort',generation:1});
  if(bootstrap)bootstrap.abort();
  if(report.failure){report.failure.session=session?.stats()||null;report.failure.bootstrap=bootstrap?.stats()||null;}
  try{
    if(outputFd!==null)fs.closeSync(outputFd);if(fd!==null)fs.closeSync(fd);
    if(derivativeCreated){demand(path.dirname(derivative)===out,'PRIORITY_CLEANUP_TARGET');fs.unlinkSync(derivative);report.derivativeRemoved=true;}
  }catch{report.passed=false;report.derivativeCleanupFailed=true;process.exitCode=1;}
  try{if(input&&before&&expectedHash){statFence();report.fingerprintMatchedAfter=await fingerprint(input)===expectedHash;statFence();report.localStateUnchanged=true;demand(report.fingerprintMatchedAfter,'PRIORITY_FINAL_FINGERPRINT');}}
  catch{report.passed=false;report.finalFenceFailed=true;process.exitCode=1;}
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'native.redacted.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,failure:report.failure?.code,stage:report.failure?.stage,derivativeRemoved:report.derivativeRemoved,
    fingerprintMatchedAfter:report.fingerprintMatchedAfter,localStateUnchanged:report.localStateUnchanged}));
});
