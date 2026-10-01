'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const r=JSON.parse(fs.readFileSync(path.join(__dirname,'result.json')));
function qualifies(x){
  const a=x.phases?.find(p=>p.name==='startup'),b=x.phases?.find(p=>p.name==='seek80');
  return x.passed===true&&x.sourceCommit==='5174485b3c17d047259701bbdd889f9b0740f555'&&x.version==='1.22.0-rc.33'
    &&x.fixtureBytes===16777216&&x.moovStart===16774586&&x.moovEnd===16777215
    &&[a,b].every(p=>p&&p.q0Current&&p.transportVerified&&p.previewHidden&&p.mode==='original-range'&&p.fullRequestCount===0&&p.storage===''&&p.totalDelivered>0&&p.totalDelivered<x.fixtureBytes)
    &&a.fixture.streams.some(s=>s.status===206&&s.isTailIndexRequest&&s.bodyComplete&&s.start<=x.moovStart&&s.end>=x.moovEnd)
    &&a.frames.some(f=>f.currentOwner&&f.width===320&&f.height===180)
    &&b.seekGeneration>a.seekGeneration&&b.frames.slice(a.frames.length).some(f=>f.currentOwner&&f.seekGeneration===b.seekGeneration&&f.mediaTime>=2.34&&f.mediaTime<=2.46)
    &&Math.abs(b.currentTime-2.4)<.08&&x.closed.totalDelivered<x.fixtureBytes&&x.closed.fixture.streams.every(s=>Boolean(s.terminal))
    &&x.apiCounts.unexpectedMedia===0&&x.pageErrors===0&&Object.keys(x.cleanup).length===5&&Object.values(x.cleanup).every(v=>v===true);
}
test('actual controlled native receipt has discriminating tail, fresh seek and complete cleanup',()=>assert(qualifies(r)));
test('whole transfer, missing tail and reused/stale frame cannot qualify',()=>{
  for(const mutate of [x=>x.closed.totalDelivered=x.fixtureBytes,x=>x.phases[0].fixture.streams.forEach(s=>s.isTailIndexRequest=false),x=>x.phases[1].seekGeneration=x.phases[0].seekGeneration,x=>x.phases[1].frames=x.phases[0].frames,x=>x.cleanup.fixtureDisposed=false]){const x=structuredClone(r);mutate(x);assert.equal(qualifies(x),false);}
});
test('receipt producer and sparse fixture remain exact immutable evidence',()=>{
  const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
  assert.equal(sha(fs.readFileSync(path.join(__dirname,'run.cjs'))),r.producerSHA256);
  const b=fs.readFileSync(path.join(__dirname,'tail-index-16m.mp4'));assert.equal(sha(b),r.fixtureSHA256);assert.equal(b.length,r.fixtureBytes);
  assert.equal(b.toString('ascii',r.moovStart+4,r.moovStart+8),'moov');
  assert.equal(b.toString('ascii',55318,55322),'free');
});
