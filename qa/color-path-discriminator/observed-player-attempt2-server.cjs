'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=new Map(),source=fs.readFileSync(path.join(root,'qa/fm05-controlled-diagnostic/subtitle.mp4'));
for(const file of require('../../scripts/public-files.cjs').filter(f=>f.startsWith('media/')&&f.endsWith('.mjs')))files.set('/'+file,fs.readFileSync(path.join(root,file)));
files.set('/source.mp4',source);files.set('/runner.js',fs.readFileSync(path.join(__dirname,'observed-player.function.js')));
const binding={source:{bytes:source.length,sha256:hash(source)},producers:[...files].filter(([p])=>p!=='/source.mp4').map(([p,b])=>({path:p,bytes:b.length,sha256:hash(b)}))};
let requests=0,servedBytes=0,failedBound=false,saved=false;
const server=http.createServer((req,res)=>{
  if(++requests>512)return failedBound=true,res.writeHead(429).end();
  if(req.url==='/result'&&req.method==='POST'){
    let count=0;const chunks=[];req.on('data',b=>{if((count+=b.length)>3*1024*1024){failedBound=true;req.destroy();return;}chunks.push(b);});
    req.on('end',()=>{try{if(saved)throw Error('COLOR_RESULT_ALREADY_SAVED');const r=JSON.parse(Buffer.concat(chunks));r.server={requests,servedBytes,failedBound};
      for(const item of [{label:'native',image:r.native},...(r.runs||[])]){
        if(item.image?.canvas?.png){fs.writeFileSync(path.join(__dirname,'observed-'+item.label+'.png'),Buffer.from(item.image.canvas.png.split(',')[1],'base64'));delete item.image.canvas.png;}
        if(item.output?.base64){const b=Buffer.from(item.output.base64,'base64');if(b.length!==item.output.bytes||hash(b)!==item.output.sha256)throw Error('COLOR_OUTPUT_BINDING');fs.writeFileSync(path.join(__dirname,'observed-output.mp4'),b);delete item.output.base64;}}
      fs.writeFileSync(path.join(__dirname,'observed-player-attempt2-result.json'),JSON.stringify(r,null,2)+'\n');saved=true;res.writeHead(200).end('{"saved":true}');
    }catch{res.writeHead(500).end();}});return;
  }
  if(req.method!=='GET')return res.writeHead(405).end();
  if(req.url==='/binding')return res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(binding));
  if(req.url==='/')return res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><meta charset="utf-8"><title>Observed native color Q1 worker proof</title><p>Isolated generated fixture; no account writes.</p><script src="/runner.js"></script>');
  const bytes=files.get(req.url);if(!bytes)return res.writeHead(404).end();let start=0,end=bytes.length-1;
  if(req.headers.range){const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!m)return res.writeHead(416).end();start=+m[1];end=m[2]?Math.min(+m[2],end):end;if(start>end||start>=bytes.length)return res.writeHead(416).end();}
  servedBytes+=end-start+1;if(servedBytes>16*1024*1024)return failedBound=true,res.writeHead(429).end();
  res.writeHead(req.headers.range?206:200,{'Content-Type':req.url.endsWith('.mp4')?'video/mp4':'text/javascript','Cache-Control':'no-store',
    'Content-Length':end-start+1,'Accept-Ranges':'bytes',...(req.headers.range?{'Content-Range':`bytes ${start}-${end}/${bytes.length}`}:{})});res.end(bytes.subarray(start,end+1));
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port,source:binding.source,producers:binding.producers.length,requestCap:512,byteCap:16*1024*1024,loopbackOnly:true})));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
