'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../..');
const product=Object.fromEntries(['app.js','styles.css','index.html'].map(n=>[n,fs.readFileSync(path.join(root,n))]));
const hashes=Object.fromEntries(Object.entries(product).map(([n,b])=>[n,crypto.createHash('sha256').update(b).digest('hex')]));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname.slice(1)||'index.html',p=path.resolve(root,name);if(!p.startsWith(root+path.sep)||!mime[path.extname(p)]||!fs.existsSync(p))return res.writeHead(404).end();res.writeHead(200,{'Content-Type':mime[path.extname(p)]});res.end(product[name]||fs.readFileSync(p));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const rows=await Promise.all(['fetch','body','worker','stale'].map(async phase=>{
   const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
   await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
   const page=await context.newPage();await page.goto(base+'/?demo=1');await page.waitForFunction(()=>!el.libraryView.hidden&&state.files.length>0);await page.locator('#settingsButton').click();
   const result=await page.evaluate(async phase=>{
    const originalFetch=window.fetch;let releaseLate,signal;
    const hanging=new Promise(resolve=>releaseLate=resolve);
    window.fetch=(url,options)=>{
     if(!String(url).includes('version.json'))return originalFetch(url,options);
     signal=options.signal;
     if(phase==='fetch'||phase==='stale')return hanging;
     return Promise.resolve({ok:true,json:()=>phase==='body'?hanging:Promise.resolve({version:'99.0.0'})});
    };
    state.serviceWorkerRegistration=phase==='worker'?{update:()=>hanging}:null;
    // Expose the worker API only in this anonymous synthetic fixture.
    if(phase==='worker'&&!('serviceWorker'in navigator))throw new Error('worker API unavailable');
    notifyUpdateAvailable('98.0.0','Previously verified synthetic update');
    const snapshot=()=>({text:el.updateStatusText.textContent,disabled:el.checkUpdateButton.disabled,applyHidden:el.applyUpdateButton.hidden});
    const started=performance.now(),older=checkForAppUpdate({manual:true});let newest;
    if(phase==='stale'){await new Promise(r=>setTimeout(r,500));newest=checkForAppUpdate({manual:false});}
    await new Promise(r=>setTimeout(r,UPDATE_CHECK_TIMEOUT_MS-1000-(phase==='stale'?500:0)));
    const beforeDeadline=snapshot();await older;const afterOlder=snapshot();if(newest)await newest;
    const afterDeadline=snapshot(),elapsed=performance.now()-started;
    releaseLate(phase==='fetch'||phase==='stale'?{ok:true,json:async()=>({version:'99.0.0'})}:{version:'99.0.0'});
    await new Promise(r=>setTimeout(r,100));const afterLate=snapshot();window.fetch=originalFetch;
    return{phase,deadline:UPDATE_CHECK_TIMEOUT_MS,elapsed,beforeDeadline,afterOlder,afterDeadline,afterLate,aborted:signal.aborted};
   },phase);
   assert.equal(result.beforeDeadline.disabled,true);assert.ok(result.elapsed>=result.deadline-100);
   assert.equal(result.afterDeadline.disabled,false);assert.equal(result.afterDeadline.applyHidden,false);assert.equal(result.aborted,true);assert.match(result.afterDeadline.text,/오류/);assert.deepEqual(result.afterLate,result.afterDeadline);
   if(phase==='stale')assert.equal(result.afterOlder.disabled,true);
   await page.screenshot({path:path.join(__dirname,`update-deadline-${phase}.png`)});await context.close();return result;
  }));
  fs.writeFileSync(path.join(__dirname,'update-deadline-results.json'),JSON.stringify({producerHash:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),hashes,accountUsed:false,realTimers:true,rows},null,2));console.log(JSON.stringify(rows));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
