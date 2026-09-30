'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const dir=__dirname,binding=JSON.parse(fs.readFileSync(dir+'/binding.json')),factory=fs.readFileSync(dir+'/journal.function.js','utf8');
const eventTarget=()=>({events:{},addEventListener(t,f){(this.events[t]??=[]).push(f);},removeEventListener(t,f){this.events[t]=(this.events[t]??[]).filter(x=>x!==f);}});
function setup({wrongOrigin=false,iframe=false,missing=false}={}){
 const w=eventTarget(),d=Object.assign(eventTarget(),{visibilityState:'visible'}),sw=Object.assign(eventTarget(),{controller:null,getRegistrations:async()=>[]});let opens=0;
 const storage=new Map();const c={window:w,document:d,navigator:{serviceWorker:sw},location:{origin:wrongOrigin?'https://example.com':binding.origin,protocol:'https:'},performance:{now:()=>1},Date,URL,Uint8Array,crypto:crypto.webcrypto,
 APP_VERSION:'1.22.0-rc.25',state:{authAccountKey:'DO_NOT_EXPORT_SECRET',authStatus:'online',selected:null},q0Playback:null,q1Playback:null,
 sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 caches:{keys:async()=>missing?[]:['drive-original-shell-1.22.0-rc.25'],match:async()=>undefined,open:async()=>{opens++;throw Error('FORBIDDEN_CACHE_OPEN');}},setInterval:()=>1,setTimeout:()=>2,clearInterval(){},clearTimeout(){}};
 c.self=c;c.top=iframe?{}:c;vm.createContext(c);const armed=vm.runInContext('('+factory+')('+JSON.stringify(binding)+',"late-attach")',c);
 return {c,w,d,sw,storage,armed,opens:()=>opens};
}
(async()=>{
 const checks=[];const pass=n=>checks.push(n);
 for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.function.js')||n.endsWith('.expression.js'))){let code=fs.readFileSync(dir+'/'+name,'utf8');new vm.Script(name.endsWith('.function.js')?'('+code+')':code);}pass('all generated and factory expressions parse');
 for(const options of [{wrongOrigin:true},{iframe:true}]){const x=setup(options);assert.equal(x.armed.armed,false);assert.equal(x.storage.size,0);assert.equal(x.opens(),0);}pass('wrong origin and iframe remain inert');
 const x=setup({missing:true});await new Promise(r=>setImmediate(r));assert.equal(x.armed.armed,true);
 await assert.rejects(x.w.__rc26NormalUpdateJournal.cacheParity('1.22.0-rc.25'),/QA_EXPECTED_CACHE_MISSING/);assert.equal(x.opens(),0);pass('missing cache fails without caches.open');
 for(const trusted of [false,true])for(const selector of ['#bannerUpdateButton','#checkUpdateButton'])for(const f of x.d.events.click)f({isTrusted:trusted,target:{closest:s=>s===selector?{}:null}});
 const result=x.w.__rc26NormalUpdateJournal.read();assert.equal(result.rows.filter(r=>r.stage==='trusted-banner-update-click').length,1);assert.equal(result.rows.filter(r=>r.stage==='trusted-normal-version-check-click').length,1);assert.equal(result.initial25LateAttach,true);assert(!JSON.stringify(result).includes('DO_NOT_EXPORT_SECRET'));pass('only trusted normal controls recorded; account data excluded');
 const clear=x.w.__rc26NormalUpdateJournal.clear();assert.equal(clear.observerReleased,true);assert.equal(x.storage.size,0);assert.equal(x.w.__rc26NormalUpdateJournal.read().listenerCount,0);await assert.rejects(x.w.__rc26NormalUpdateJournal.cacheParity('1.22.0-rc.25'),/QA_OBSERVER_STOPPED/);pass('cleanup removes owned storage and listeners; later reads refused');
 const y=setup();await new Promise(r=>setImmediate(r));const mismatch=await y.w.__rc26NormalUpdateJournal.cacheParity('1.22.0-rc.25');assert.equal(mismatch.cacheParity,false);assert.equal(mismatch.missing,40);assert.equal(mismatch.networkRequestsByObserver,0);y.w.__rc26NormalUpdateJournal.clear();pass('missing cached bodies cannot pass parity');
 const output={passed:true,browserExecuted:false,checks,source25:binding.versions[0].source,source26:binding.versions[1].source};fs.writeFileSync(dir+'/local-checks.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
})().catch(e=>{console.error(e);process.exitCode=1;});
