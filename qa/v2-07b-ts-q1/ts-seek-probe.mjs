// Bounded sparse-read seek-candidate QA. FFprobe is an independent whole-source
// oracle, outside the browser-safe probe and its byte/request accounting.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,unlinkSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {probeTsSeek} from './ts-seek.mjs';
import {runBoundedProbe} from '../v2-07a-bounded-probe/bounded-probe.mjs';

const root=fileURLToPath(new URL('.',import.meta.url)),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function command(executable,args){const result=spawnSync(executable,args,{windowsHide:true,timeout:60000,maxBuffer:8*1024*1024});
  assert.ok(!result.error&&result.status===0&&!result.stderr.length,'PUBLIC_TOOL_FAILED');return result.stdout.toString('utf8');}
const generator=['-v','error','-hide_banner','-nostdin','-n',
  '-f','lavfi','-i','testsrc2=size=360x640:rate=30:duration=180',
  '-f','lavfi','-i','sine=frequency=880:sample_rate=48000:duration=180',
  '-map','0:v:0','-map','1:a:0','-vf','setpts=PTS+0.25/TB',
  '-c:v','libx264','-threads:v','1','-preset','veryfast','-profile:v','high','-level:v','3.0',
  '-pix_fmt','yuv420p','-g','60','-keyint_min','60','-sc_threshold','0','-bf','2',
  '-x264-params','aud=1:repeat-headers=1','-c:a','aac','-b:a','96k','-ar','48000','-ac','2','-f','mpegts'];
const directory=mkdtempSync(path.join(root,'run-ts-seek-')),sourceFile=path.join(directory,'continuous.ts');
let server;
try{
  command('ffmpeg',[...generator,sourceFile]);const fixture=readFileSync(sourceFile),fixtureHash=sha(fixture);
  assert.ok(fixture.length>16*1024*1024&&fixture.length<32*1024*1024);
  const oracle=JSON.parse(command('ffprobe',['-v','error','-show_packets','-show_streams','-show_entries',
    'packet=stream_index,pts,dts,pos,flags,duration:stream=index,codec_type,sample_rate,channels','-of','json',sourceFile]));
  const videoTrack=oracle.streams.find(row=>row.codec_type==='video'),audioTrack=oracle.streams.find(row=>row.codec_type==='audio');
  const videos=oracle.packets.filter(row=>row.stream_index===videoTrack.index),audios=oracle.packets.filter(row=>row.stream_index===audioTrack.index);
  const origin=Math.min(...videos.map(row=>row.pts),...audios.map(row=>row.pts));
  const end=Math.max(...videos.map(row=>row.pts+row.duration),...audios.map(row=>row.pts+row.duration));
  const observations=[],runs=new Map();
  const identity={accountKey:'public-qa-account',fileId:'generated-local-180-second-control',version:'1',size:String(fixture.length),
    modifiedTime:'2026-09-26T00:00:00.000Z',mimeType:'video/mp2t',canDownload:true};
  server=createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost'),run=runs.get(url.searchParams.get('run'));
    if(!run||req.method!=='GET'){res.writeHead(404).end();return;}
    if(url.pathname==='/identity'){
      run.identityReads++;
      const version=(run.mode==='preflight-drift'||run.mode==='postflight-drift'&&run.identityReads>1)?'2':'1';
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({...identity,version}));return;
    }
    if(url.pathname!=='/source.ts'){res.writeHead(404).end();return;}
    const range=/^bytes=(\d+)-(\d+)$/.exec(req.headers.range||'');
    if(!range){res.writeHead(416).end();return;}
    const start=Number(range[1]),finish=Number(range[2]),length=finish-start+1;
    if(!Number.isSafeInteger(finish)||start<0||length<=0||length>1024*1024||finish>=fixture.length){res.writeHead(416).end();return;}
    run.ranges.push({start,end:finish});run.sent+=length;
    if(run.mode==='generation-change'&&run.ranges.length===3)run.current=false;
    if(run.mode==='abort-read'&&run.ranges.length===3){run.controller.abort();res.writeHead(499).end();return;}
    res.writeHead(206,{'Content-Type':'video/mp2t','Content-Length':length,
      'Content-Range':`bytes ${start}-${finish+(run.mode==='wrong-range'?1:0)}/${fixture.length}`,
      'Accept-Ranges':'bytes','Cache-Control':'private, no-store, no-transform',ETag:`"${fixtureHash}"`})
      .end(fixture.subarray(start,finish+1));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  const cases=[...['10','50','90'].map(percent=>({mode:'positive-'+percent,fraction:Number(percent)/100})),
    ...['preflight-drift','postflight-drift','generation-change','abort-read','wrong-range','request-budget'].map(mode=>({mode,fraction:.5}))];
  for(const {mode,fraction} of cases){
    const run={mode,identityReads:0,ranges:[],sent:0,current:true,controller:new AbortController()};runs.set(mode,run);
    const result=await runBoundedProbe({expectedIdentity:identity,generation:1,isGenerationCurrent:()=>run.current,signal:run.controller.signal,
      getIdentity:async({signal})=>(await fetch(`${base}/identity?run=${mode}`,{signal})).json(),
      readRange:request=>fetch(`${base}/source.ts?run=${mode}`,{headers:{Range:request.range},signal:request.signal}),
      probe:async({read})=>{try{return await probeTsSeek({read,sourceSize:fixture.length,fraction});}
        catch(error){run.probeFailure=/^SEEK_[A-Z_]+$/.test(error.message)?error.message:'PROBE_OWNER_FAILURE';throw error;}},
      limits:mode==='request-budget'?{fileRequests:2}:undefined});
    const observation={mode,fraction,ok:result.ok,metrics:result.metrics,identity:result.identity,
      serverRequests:run.ranges.length,serverBytes:run.sent,ranges:run.ranges};
    if(mode.startsWith('positive-')){
      assert.equal(result.ok,true,JSON.stringify({mode,failure:result.failure,probeFailure:run.probeFailure,ranges:run.ranges}));const found=result.evidence;
      assert.equal(found.timeline.globalContinuityVerified,false);
      assert.equal(found.timeline.originTicks,origin);assert.ok(Math.abs(found.timeline.endTicks-end)<=1);
      assert.ok(Math.abs(found.targetTicks-(origin+fraction*(end-origin)))<=1);
      const expected=videos.filter(row=>row.flags.includes('K')&&row.pts<=found.targetTicks).at(-1);assert.ok(expected);
      assert.equal(found.rap.offset,Number(expected.pos));assert.equal(found.rap.pts,expected.pts);assert.equal(found.rap.dts,expected.dts);
      assert.ok(found.rap.sps.length&&found.rap.pps.length);
      for(const anchor of [found.local.before,found.local.after]){
        const original=videos.find(row=>Number(row.pos)===anchor.offset);assert.ok(original);
        assert.equal(anchor.pts,original.pts);assert.equal(anchor.dts,original.dts);
      }
      assert.ok(found.local.before.pts<=found.targetTicks&&found.local.after.pts>=found.targetTicks);
      assert.ok(found.local.after.pts-found.local.before.pts<=found.timeline.videoStepTicks);
      assert.equal(found.local.decodeStartSliceVerified,false);assert.equal(found.local.completePicturesVerified,false);
      assert.ok(run.sent<fixture.length*.35);assert.ok(run.ranges.length<=12);assert.ok(result.metrics.requests===run.ranges.length);
      assert.ok(run.ranges.some(row=>row.start>fixture.length*.05&&row.end<fixture.length*.98));
      assert.equal(result.identity.preflight,true);assert.equal(result.identity.postflight,true);
      observation.candidate={timeline:found.timeline,targetTicks:found.targetTicks,rap:{offset:found.rap.offset,pts:found.rap.pts,dts:found.rap.dts},
        nativeRapPositionTimingEqual:true,nativeTargetBracketEqual:true,nativeEndpointEstimateEqual:true,receivedFraction:run.sent/fixture.length};
    }else{
      const expected={'preflight-drift':'IDENTITY_MISMATCH','postflight-drift':'POSTFLIGHT_DRIFT','generation-change':'GENERATION_STALE',
        'abort-read':'ABORTED','wrong-range':'CONTENT_RANGE_INVALID','request-budget':'FILE_REQUEST_LIMIT'}[mode];
      assert.equal(result.ok,false);assert.equal(result.failure.code,expected);assert.equal(result.evidence,null);
      const requestCount={'preflight-drift':0,'postflight-drift':observations.find(row=>row.mode==='positive-50').serverRequests,
        'generation-change':3,'abort-read':3,'wrong-range':1,'request-budget':2}[mode];
      assert.equal(run.ranges.length,requestCount,'TERMINAL_PROBE_MUST_NOT_ISSUE_ANOTHER_MEDIA_READ');
      observation.failure=result.failure.code;
    }
    observations.push(observation);
  }
  const sources={};for(const file of ['ts-seek-probe.mjs','ts-seek.mjs','ts-window.mjs','gop-boundaries.mjs','psi-stream.mjs',
    '../v2-07a-container-probe/mpeg-ts-probe.mjs','../v2-07a-bounded-probe/bounded-probe.mjs'])sources[file]=sha(readFileSync(path.join(root,file)));
  const report={schema:'drive-original.q1-ts-sparse-seek/1',recordedAt:new Date().toISOString(),
    producer:{sources,node:process.version,ffmpeg:command('ffmpeg',['-version']).split(/\r?\n/)[0]},
    fixture:{durationSeconds:180,bytes:fixture.length,sha256:fixtureHash,generator},observations,
    limitations:['public native whole-source oracle and local HTTP only; no current Drive/private original/device evidence',
      'candidate duration and sparse clocks only; unseen resets/wrap/discontinuity remain unproven',
      'target IDR discovery is not a self-contained decode interval or actual presented seek frame',
      'QA retains whole source and FFprobe oracle outside bounded probe; read metrics are not total heap']};
  writeFileSync(path.join(directory,'results.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({report:path.relative(root,path.join(directory,'results.json')),passed:observations.length}));
}finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  // Exact generated file owned by this run; no directory/glob or original data.
  try{unlinkSync(sourceFile);}catch(error){if(error.code!=='ENOENT')throw error;}
}
