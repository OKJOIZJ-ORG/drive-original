'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),root=path.resolve(__dirname,'../..');
const refs=['8a2894ee2c7aa85c9cb2ff992879f4580e15e2e7','7ba8e654fa38def8c8e00efcbf1600a4c8730c53'];
const digest=b=>crypto.createHash('sha256').update(b).digest('hex'),blob=(ref,file)=>execFileSync('git',['show',`${ref}:${file}`],{cwd:root,maxBuffer:12*1024**2});
function build(){const updateApp=fs.readFileSync(path.join(root,'app.js'),'utf8'),a=updateApp.indexOf('async function applyAppUpdate() {'),z=updateApp.indexOf('async function forceReloadApp()',a),updateFunction=updateApp.slice(a,z);assert(a>=0&&z>a);const pool=new Map();const immutable=bytes=>{const key=digest(bytes),previous=pool.get(key);if(previous){assert(previous.equals(bytes));return previous;}pool.set(key,bytes);return bytes;};return refs.map((ref,i)=>{const m={exports:null};vm.runInNewContext(blob(ref,'scripts/public-files.cjs').toString(),{module:m},{timeout:1000});
  const files=new Map(m.exports.map(f=>['/'+f,immutable(blob(ref,f))]));const originalApp=files.get('/app.js').toString('utf8'),begin=originalApp.indexOf('async function applyAppUpdate() {'),end=originalApp.indexOf('async function forceReloadApp()',begin);assert(begin>=0&&end>begin);files.set('/app.js',immutable(Buffer.from(originalApp.slice(0,begin)+updateFunction+originalApp.slice(end))));files.set('/.nojekyll',immutable(Buffer.alloc(0)));assert.equal(files.size,52);
  assert.equal(JSON.parse(files.get('/version.json')).version,'1.22.0-rc.'+(24+i));
  return {source:ref,version:'1.22.0-rc.'+(24+i),files,hashes:Object.fromEntries([...files].map(([k,b])=>[k.slice(1),digest(b)]))};});}
async function start({port=0}={}){
 const bundles=build();let phase=0,switched=false,requests=0,stopped=false;const counters={public24:0,public25:0,control:0,denied:0,worker24:0,worker25:0,documents24:0,documents25:0};
 const report={schema:'drive-original.normal-update-local-server/1',source24:refs[0],source25:refs[1],binding:bundles.map(b=>({source:b.source,version:b.version,publicFiles:52,hashes:b.hashes})),
   producerSha256:digest(fs.readFileSync(__filename)),fixedBuffers:true,overlay:{scope:'Only current applyAppUpdate function replaces same function in both immutable historical app versions',currentAppSha256:digest(fs.readFileSync(path.join(root,'app.js')))},totalRetainedAssetBytes:[...new Set(bundles.flatMap(b=>[...b.files.values()]))].reduce((n,b)=>n+b.length,0),logicalAssetBytesBothVersions:bundles.reduce((sum,b)=>sum+[...b.files.values()].reduce((n,bytes)=>n+bytes.length,0),0),externalProvider:false,syntheticAccount:false,browserLaunched:false};
 const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.wasm':'application/wasm','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.tgz':'application/gzip','.txt':'text/plain','.md':'text/plain'};
 let timer;const server=http.createServer(async(req,res)=>{
  requests++;const u=new URL(req.url,'http://127.0.0.1');
  if(req.socket.remoteAddress!=='127.0.0.1'||req.headers.host!==`127.0.0.1:${server.address().port}`){counters.denied++;return res.writeHead(403).end();}
  const origin=`http://127.0.0.1:${server.address().port}`;
  if(u.pathname.startsWith('/__qa_')){
   counters.control++;if(u.pathname==='/__qa_status'&&req.method==='GET')return res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({phase:24+phase,switched,counters,requests,stopped}));
   if(req.method!=='POST'||(req.headers.origin&&req.headers.origin!==origin)){counters.denied++;return res.writeHead(403).end();}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>128){counters.denied++;return res.writeHead(413).end();}}
   if(u.pathname==='/__qa_switch25'&&body==='SWITCH_24_TO_25'&&!switched){phase=1;switched=true;return res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end('{"switched":true,"version":"1.22.0-rc.25"}');}
   if(u.pathname==='/__qa_stop'&&body==='STOP_QA_SERVER'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end('{"stopping":true}');return setImmediate(stop);}
   counters.denied++;return res.writeHead(409).end();
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){counters.denied++;return res.writeHead(405).end();}
  const name=u.pathname==='/'?'/index.html':u.pathname,data=bundles[phase].files.get(name);
  if(!data){counters.denied++;return res.writeHead(404,{'Cache-Control':'no-store'}).end();}
  counters['public'+(24+phase)]++;if(name==='/sw.js')counters['worker'+(24+phase)]++;if(name==='/index.html')counters['documents'+(24+phase)]++;
  res.writeHead(200,{'Content-Type':types[path.extname(name)]??'application/octet-stream','Content-Length':data.length,'Cache-Control':'no-store',
    'X-DNS-Prefetch-Control':'off','Content-Security-Policy':"default-src 'self' data: blob:; connect-src 'self'; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:; frame-src 'none'"});
  res.end(req.method==='HEAD'?undefined:data);
 });
 await new Promise(r=>server.listen(port,'127.0.0.1',r));report.port=server.address().port;
 const status=()=>({...report,phase:24+phase,switched,counters:{...counters},requests,stopped});
 function save(){fs.writeFileSync(path.join(__dirname,'normal-update-fixed-server-result.json'),JSON.stringify(status(),null,2)+'\n');}
 function stop(){if(stopped)return;stopped=true;clearTimeout(timer);server.closeAllConnections();server.close(()=>save());}
 timer=setTimeout(stop,30*60*1000);save();return {origin:`http://127.0.0.1:${report.port}`,stop,status};
}
module.exports={build,start};if(require.main===module)start().then(s=>{console.log(JSON.stringify({listening:true,origin:s.origin,source24:refs[0],source25:refs[1],switchPath:'/__qa_switch25',stopPath:'/__qa_stop',browserLaunched:false}));process.on('SIGINT',s.stop);process.on('SIGTERM',s.stop);});
