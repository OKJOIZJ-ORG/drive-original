'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../..');
const product=Object.fromEntries(['app.js','styles.css','index.html'].map(n=>[n,fs.readFileSync(path.join(root,n))]));
const hashes=Object.fromEntries(Object.entries(product).map(([n,bytes])=>[n,crypto.createHash('sha256').update(bytes).digest('hex')]));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname.slice(1)||'index.html',p=path.resolve(root,name);if(!p.startsWith(root+path.sep)||!mime[path.extname(p)]||!fs.existsSync(p))return res.writeHead(404).end();res.writeHead(200,{'Content-Type':mime[path.extname(p)],'Cache-Control':'no-store'});res.end(product[name]||fs.readFileSync(p));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const page=await context.newPage();await page.goto(base+'/?demo=1');await page.waitForFunction(()=>!el.libraryView.hidden&&state.files.length>0);
  await page.locator('#settingsButton').click();
  const result=await page.evaluate(async()=>{
   const originalFetch=window.fetch,requests=[];state.serviceWorkerRegistration=null;
   window.fetch=(url,options)=>String(url).includes('version.json')?new Promise(resolve=>requests.push(resolve)):originalFetch(url,options);
   const snapshot=()=>({bannerHidden:el.updateBanner.hidden,applyHidden:el.applyUpdateButton.hidden,dotHidden:el.settingsUpdateDot.hidden,text:el.updateStatusText.textContent,checkDisabled:el.checkUpdateButton.disabled});
   const oldBackground=checkForAppUpdate({manual:false});
   const newerManual=checkForAppUpdate({manual:true});
   requests[1](new Response(JSON.stringify({version:'99.0.0',changeSummary:'Public synthetic update'}),{status:200}));
   await newerManual;const afterNew=snapshot();
   requests[0](new Response(JSON.stringify({version:APP_VERSION}),{status:200}));
   await oldBackground;const afterStale=snapshot();window.fetch=originalFetch;
   return{requestCount:requests.length,afterNew,afterStale};
  });
  assert.equal(result.afterNew.applyHidden,false);
  assert.equal(result.afterStale.applyHidden,false,'latest update remains available');
  assert.deepEqual(result.afterStale,result.afterNew);
  const cases=await page.evaluate(async()=>{
   const rows=[];
   for(const scenario of [{newest:'update',older:'error',newerFirst:true},{newest:'error',older:'current',newerFirst:false},{newest:'current',older:'update',newerFirst:false}]){
    const originalFetch=window.fetch,requests=[];
    el.updateBanner.hidden=true;el.applyUpdateButton.hidden=true;el.settingsUpdateDot.hidden=true;
    window.fetch=(url,options)=>String(url).includes('version.json')?new Promise((resolve,reject)=>requests.push({resolve,reject})):originalFetch(url,options);
    const snapshot=()=>({applyHidden:el.applyUpdateButton.hidden,text:el.updateStatusText.textContent,checkDisabled:el.checkUpdateButton.disabled});
    const older=checkForAppUpdate({manual:true}),newest=checkForAppUpdate({manual:false});
    const settle=(index,value)=>value==='error'?requests[index].reject(new Error('synthetic offline')):requests[index].resolve(new Response(JSON.stringify({version:value==='update'?'99.0.0':APP_VERSION}),{status:200}));
    let intermediate;
    if(scenario.newerFirst){settle(1,scenario.newest);await newest;intermediate=snapshot();settle(0,scenario.older);await older;}
    else{settle(0,scenario.older);await older;intermediate=snapshot();settle(1,scenario.newest);await newest;}
    rows.push({scenario,intermediate,final:snapshot()});window.fetch=originalFetch;
   }
   return rows;
  });
  for(const row of cases){assert.equal(row.final.checkDisabled,false);assert.equal(row.final.applyHidden,row.scenario.newest!=='update');if(!row.scenario.newerFirst)assert.equal(row.intermediate.checkDisabled,true);else assert.deepEqual(row.intermediate,row.final);assert.match(row.final.text,row.scenario.newest==='error'?/오류/:row.scenario.newest==='update'?/99\.0\.0/:/현재 최신/);}
  await page.screenshot({path:path.join(__dirname,'update-after.png')});
  fs.writeFileSync(path.join(__dirname,'update-race-after-results.json'),JSON.stringify({producerHash:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),hashes,accountUsed:false,productEdited:false,result,cases},null,2));
  console.log(JSON.stringify(result));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
