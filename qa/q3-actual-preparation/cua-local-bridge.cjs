'use strict';
// Exact local QA scripts and bounded local result backups; no Drive/media endpoint.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const ORIGIN='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const SOURCE='5174485b3c17d047259701bbdd889f9b0740f555',FIXTURE='cda53855c53bf1d608491eb96aa3abb0ff774cca2aa24cfe01447e295c07ed7a';
const pins={
 'source-proof.expression.js':'fdd71db2cc76e36921db9c2bb512183ea2f8ad70d4302d094276551884b57954',
 'observer.expression.js':'82e4b8a791b47a2dd40ec88b665d22f4e25ac5031780a0d0840c7934dc68c009',
 'disposable-factory.expression.js':'b65b66f40ef912697ccc02be1e4af23e032b932571c9ef5dcf672152b675d5c1',
 'disposable-facade.function.js':'96f1a87c5217983c6e38c7120f7313cf8cb2437ac6bbec032d7c6f15ef762cd2',
 'disposable-file-input.function.js':'a25ccfb81801f1e8998cb1978c3bccd11a73d2820a41fc894ecefa676ec8af05',
 'disposable-binding.json':'b6700dda5863e38d9245338612b70f313a1d8a7eeb98ae46424303ec8f200a54',
 'pc-seek-targets33.expression.js':'145a0533560cf6e37eb1c9a56f3cc85d97a5e88dc71cb7c209dfd8c09dbf1e9a'
};
function admit(kind,x){
 const raw=JSON.stringify(x);if(/"(?:token|access_token|refresh_token|authorization|cookie)"\s*:/i.test(raw))throw Error('CREDENTIAL_KEY');
 if(kind==='ledger'){const p=JSON.parse(x.pointer?.value||'null'),l=x.ledger;
  if(x.pointer?.key!=='drive-original.qa.disposable.q3-180s.'+FIXTURE+'.run'||!p||p.run!==l?.run||l?.purpose!=='q3-exact-fixture'||l.binding?.source!==SOURCE||l.fixture?.sha256!==FIXTURE||l.planned?.length!==2)throw Error('LEDGER_SCOPE');
 }else if(kind==='target'){
  if(x.metadata?.sha256Checksum!==FIXTURE||Number(x.metadata?.size)!==18075476||!x.account?.accountId||!x.account?.authAccountKey)throw Error('TARGET_SCOPE');
 }else if(kind==='receipt'){
  if(x.schema!=='drive-original.q3-actual-observation/1'||x.sourceCommit!==SOURCE||x.version!=='1.22.0-rc.33'||x.rawIdentifiersExported!==false||/"(?:accountId|authAccountKey|fileId|resourceKey|headRevisionId)"\s*:/.test(raw))throw Error('RECEIPT_SCOPE');
 }else throw Error('BACKUP_SCOPE');
 return raw;
}
function run(){
 const label=process.argv[2];if(!/^cua[1-9]\d?$/.test(label||''))throw Error('EXACT_RUN_LABEL');
 const nonce=crypto.randomBytes(24).toString('hex'),files=new Map();for(const [name,sha] of Object.entries(pins)){const b=fs.readFileSync(path.join(__dirname,name));if(b.length>200000||crypto.createHash('sha256').update(b).digest('hex')!==sha)throw Error('QA_SOURCE_DRIFT');files.set(name,b);}
 const logPath=path.join(__dirname,`cua-local-bridge-${label}-safe.json`);if(fs.existsSync(logPath))throw Error('RESULT_EXISTS');
 const log={sourceCommit:SOURCE,startedAt:new Date().toISOString(),requests:0,saved:[],failures:[],localOnly:true,mediaServed:false,ownedServerClosed:false};let timer;const sockets=new Set(),counts={ledger:0,target:0,receipt:0};
 const save=()=>fs.writeFileSync(logPath,JSON.stringify(log,null,2)+'\n');
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin',ORIGIN);res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Private-Network','true');
  try{
   if(++log.requests>60||req.headers.host!==`127.0.0.1:${server.address().port}`||req.headers.origin!==ORIGIN||req.headers.authorization||req.headers.cookie)throw Error('LOCAL_REQUEST_SCOPE');
   const u=new URL(req.url,'http://127.0.0.1');if(u.searchParams.get('key')!==nonce)throw Error('LOCAL_NONCE');
   if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
   if(req.method==='GET'&&files.has(u.pathname.slice(1))){res.setHeader('Content-Type','text/plain;charset=utf-8');res.writeHead(200).end(files.get(u.pathname.slice(1)));return;}
   const kind=u.pathname.slice(1);if(req.method!=='POST'||!Object.hasOwn(counts,kind)||counts[kind]>=6)throw Error('LOCAL_ROUTE');
   let length=0;const chunks=[];req.setTimeout(10000,()=>req.destroy());for await(const b of req){length+=b.length;if(length>2097152)throw Error('BACKUP_BYTE_BOUND');chunks.push(b);}
   const x=JSON.parse(Buffer.concat(chunks).toString('utf8')),raw=admit(kind,x)+'\n';
   const privateKind=kind!=='receipt',dir=privateKind?path.resolve(__dirname,'../v2-state-recovery-backup'):__dirname;
   const name=`q3-${kind}-${label}-${++counts[kind]}-${privateKind?'private':'safe'}.json`,dest=path.join(dir,name);
   fs.writeFileSync(dest,raw,{flag:'wx'});const proof={kind,ordinal:counts[kind],bytes:Buffer.byteLength(raw),sha256:crypto.createHash('sha256').update(raw).digest('hex'),savedLocally:true,private:privateKind};log.saved.push(proof);save();res.setHeader('Content-Type','application/json');res.writeHead(200).end(JSON.stringify(proof));
  }catch(e){const code=/^[A-Z_]+$/.test(e.message)?e.message:'LOCAL_OPERATION_FAILED';log.failures.push(code);save();if(!res.headersSent)res.writeHead(400);res.end(JSON.stringify({failed:true,code}));}
 });
 server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
 const stop=()=>{clearTimeout(timer);for(const s of sockets)s.destroy();server.close(()=>{log.ownedServerClosed=true;log.endedAt=new Date().toISOString();save();});};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);server.listen(0,'127.0.0.1',()=>{timer=setTimeout(stop,1500000);save();console.log(JSON.stringify({ready:true,port:server.address().port,nonce,sourceCommit:SOURCE,scripts:files.size,localOnly:true}));});
}
if(require.main===module)run();module.exports={admit,pins};
