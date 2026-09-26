'use strict';
// Explicitly selected private original, read-only. No frames, paths, identifiers,
// fingerprints, derivative media or account credentials enter the output report.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceFiles=['qa/q1-priority-audit.cjs','media/q1-core.mjs','media/transmux-worker.mjs','media/build.json'];
const sources=()=>Object.fromEntries(sourceFiles.map(file=>[file,digest(fs.readFileSync(path.join(root,file)))]));
const producerHashes=sources(),report={recordedAt:new Date().toISOString(),sourceLabel:'priority-sample-1',
  sources:producerHashes,currentDriveIdentityVerified:false,originalWrites:0,probes:[],scope:'local read-only original and product Q1 admission; not authenticated Drive/browser/device playback'};
async function fingerprint(file){const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
const identity=stat=>({size:stat.size,mtimeMs:stat.mtimeMs,ino:stat.ino,dev:stat.dev});
const safeError=error=>/^(?:SEEK|BOOTSTRAP|PRIORITY)_[A-Z_]+$/.test(error?.message)?error.message:'PRIORITY_AUDIT_FAILED';
(async()=>{
  const privatePath=process.argv[2];assert.ok(privatePath,'Explicit private expectation file required');
  const expected=JSON.parse(fs.readFileSync(privatePath)),file=expected.localPath;
  assert.ok(typeof file==='string'&&path.isAbsolute(file));
  const before=identity(fs.statSync(file));assert.equal(before.size,Number(expected.drive.size));
  const hash=await fingerprint(file);assert.equal(hash,expected.localBytes.sha256.toLowerCase());
  report.size=before.size;report.historicalFingerprintMatched=true;
  const native=spawnSync('ffprobe',['-v','error','-probesize','8388608','-analyzeduration','5000000','-show_entries',
    'format=format_name,duration,start_time:stream=index,codec_type,codec_name,profile,level,width,height,pix_fmt,sample_aspect_ratio,color_range,color_space,color_transfer,color_primaries,r_frame_rate,avg_frame_rate,sample_rate,channels',
    '-of','json',file],{windowsHide:true,timeout:30000,maxBuffer:1024*1024});
  assert.ok(!native.error&&native.status===0&&!native.stderr.length,'PRIORITY_NATIVE_METADATA_FAILED');
  const metadata=JSON.parse(native.stdout);report.metadata={format:metadata.format,streams:metadata.streams};
  const duration=Number(metadata.format.duration);assert.ok(duration>0&&Number.isFinite(duration));
  const {probeTsSeek,createSeekBootstrap}=await import('../media/q1-core.mjs');
  const fd=fs.openSync(file,'r');
  try{
    for(const seconds of [0,duration*.1,duration*.5,duration*.9,duration-2]){
      const ranges=[];
      const read=async({start,end})=>{
        assert.deepEqual(identity(fs.fstatSync(fd)),before,'PRIORITY_SOURCE_DRIFT');
        assert.ok(Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&end>=start&&end<before.size&&end-start+1<=1048576);
        const bytes=new Uint8Array(end-start+1);assert.equal(fs.readSync(fd,bytes,0,bytes.length,start),bytes.length);
        assert.deepEqual(identity(fs.fstatSync(fd)),before,'PRIORITY_SOURCE_DRIFT');ranges.push({start,end});return bytes;
      };
      try{
        const plan=await probeTsSeek({read,sourceSize:before.size,positionSeconds:seconds});
        const headBytes=await read({start:0,end:Math.min(before.size,Math.floor(65536/188)*188)-1});
        const bytes=await read({start:plan.local.windowStart,end:plan.local.windowEndExclusive-1});
        const bootstrap=createSeekBootstrap({generation:1,headBytes,bytes,offset:plan.local.windowStart,plan});
        const stats=bootstrap.stats();bootstrap.abort();
        report.probes.push({seconds,passed:true,targetSeconds:(plan.targetTicks-plan.timeline.originTicks)/90000,
          timeline:plan.timeline,rap:{offset:plan.rap.offset,pts:plan.rap.pts,dts:plan.rap.dts},bootstrap:stats,ranges});
      }catch(error){report.probes.push({seconds,passed:false,failure:safeError(error),ranges});}
    }
  }finally{fs.closeSync(fd);}
  assert.deepEqual(identity(fs.statSync(file)),before,'PRIORITY_SOURCE_DRIFT');
  report.fingerprintMatchedAfter=await fingerprint(file)===hash;
  assert.equal(report.fingerprintMatchedAfter,true);
  assert.deepEqual(identity(fs.statSync(file)),before,'PRIORITY_SOURCE_DRIFT');report.localStateUnchanged=true;
  assert.deepEqual(sources(),producerHashes);
  report.passed=report.probes.every(row=>row.passed);if(!report.passed)process.exitCode=1;
})().catch(error=>{report.passed=false;report.error=safeError(error);process.exitCode=1;}).finally(()=>{
  const out=path.join(__dirname,'q1-priority');fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'results.redacted.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,historicalFingerprintMatched:report.historicalFingerprintMatched,
    fingerprintMatchedAfter:report.fingerprintMatchedAfter,probes:report.probes.map(row=>({seconds:row.seconds,passed:row.passed,failure:row.failure,reads:row.ranges.length}))}));
});
