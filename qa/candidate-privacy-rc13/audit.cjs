'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),source='570f9c38506d1e426c33cf65b73836d32bf872c0';
const git=n=>execFileSync('git',['show',`${source}:${n}`],{cwd:root,maxBuffer:6e6});
const allowed=require('../../scripts/public-files.cjs'),product=Object.fromEntries(allowed.map(n=>[n,git(n)]));
const after=process.argv.includes('--after');
if(after)product['app.js']=fs.readFileSync(path.join(root,'app.js'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const hashes=Object.fromEntries(Object.entries(product).map(([n,b])=>[n,hash(b)]));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain'};
const server=http.createServer((req,res)=>{const n=new URL(req.url,'http://local').pathname.slice(1)||'index.html';if(!product[n])return res.writeHead(404).end();res.writeHead(200,{'Content-Type':mime[path.extname(n)],'Cache-Control':'no-store'});res.end(product[n]);});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,candidate='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  const page=await context.newPage(),logs=[];
  page.on('console',message=>{if(['error','warning'].includes(message.type()))logs.push(message.text());});
  await page.goto(base+'/?demo=1');await page.waitForFunction(()=>!el.libraryView.hidden&&state.files.length>0);
  logs.length=0;
  const local=await page.evaluate(async()=>{
   state.demo=false;state.token='PUBLIC_SYNTHETIC_CREDENTIAL';state.expiresAt=Date.now()+3600000;
   state.authCapabilities={version:1,driveRead:true,driveWrite:false,appData:false};
   const originalFetch=window.fetch;
   window.fetch=(url,options)=>String(url).startsWith(DRIVE_API)?Promise.resolve(new Response(JSON.stringify({error:{message:'File not found: QA_PRIVATE_ID_CANARY.',errors:[{reason:'notFound'}]}}),{status:404})):originalFetch(url,options);
   const loaded=await loadFiles({append:false});window.fetch=originalFetch;
   const safe=sanitizeMediaDiagnosticDetails({status:404,token:'QA_SECRET_CANARY',cookie:'QA_COOKIE_CANARY',url:'https://private.invalid/QA_PRIVATE_ID_CANARY',fileId:'QA_PRIVATE_ID_CANARY',refreshToken:'QA_REFRESH_CANARY',bytes:new Uint8Array([1,2])});
   return{loaded,uiContainsCanary:el.libraryStatus.textContent.includes('QA_PRIVATE_ID_CANARY'),sanitizedKeys:Object.keys(safe)};
  });
  const consolePrivateId=logs.some(line=>line.includes('QA_PRIVATE_ID_CANARY'));
  assert.equal(consolePrivateId,!after,'real listing caller must discriminate raw before from classified after');
  if(after)assert.ok(logs.some(line=>line.includes('[drive-original] library-list')));
  assert.deepEqual(local.sanitizedKeys,['status']);
  const remote=[];
  for(const route of after?[]:['/api/session/credential','/api/not-a-real-endpoint']){
   const response=await fetch(candidate+route,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000)}),body=await response.text();
   remote.push({route,method:'GET',status:response.status,noStore:response.headers.get('cache-control'),setCookiePresent:response.headers.has('set-cookie'),code:(()=>{try{return JSON.parse(body).error?.code||null;}catch{return null;}})(),sensitiveFields:/accessToken|refreshToken|client_secret|Bearer\s|__Host-drive_original_session=/i.test(body)});
   assert.equal(remote.at(-1).sensitiveFields,false);
  }
  let deployedAppGitEqual=null;
  if(!after){const deployed=await fetch(candidate+'/app.js',{signal:AbortSignal.timeout(15000)});const liveApp=Buffer.from(await deployed.arrayBuffer());assert.equal(hash(liveApp),hash(git('app.js')));deployedAppGitEqual=true;}
  fs.writeFileSync(path.join(__dirname,after?'after-results.json':'results.json'),JSON.stringify({source,after,producerHash:hash(fs.readFileSync(__filename)),hashes,mcpFallback:'Existing MCP-owned profile lock; fresh isolated Playwright context used',accountUsed:false,local:{...local,consolePrivateId,consoleCount:logs.length},remote,deployedAppGitEqual,hostedLogsAccessed:false},null,2));
  console.log(JSON.stringify({local:{...local,consolePrivateId},remote,deployedAppGitEqual}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
