'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const files={'/source.mp4':fs.readFileSync(path.join(root,'qa/fm05-controlled-diagnostic/subtitle.mp4')),
  '/remux.mp4':fs.readFileSync(path.join(__dirname,'observed-output.mp4')),'/runner.js':fs.readFileSync(path.join(__dirname,'normalized-resource.function.js'))};
const binding=Object.fromEntries(Object.entries(files).map(([p,b])=>[p,{bytes:b.length,sha256:hash(b)}]));let requests=0,servedBytes=0,saved=false;
const server=http.createServer((req,res)=>{
  if(++requests>64)return res.writeHead(429).end();
  if(req.url==='/result'&&req.method==='POST'){const chunks=[];let n=0;req.on('data',b=>{if((n+=b.length)>2*1024*1024)return req.destroy();chunks.push(b);});
    req.on('end',()=>{try{if(saved)throw Error('ALREADY_SAVED');const r=JSON.parse(Buffer.concat(chunks));r.binding=binding;r.server={requests,servedBytes};
      for(const item of r.cases||[])for(const v of item.views||[]){if(v.png){fs.writeFileSync(path.join(__dirname,'resource-'+v.label+'.png'),Buffer.from(v.png.split(',')[1],'base64'));delete v.png;}}
      fs.writeFileSync(path.join(__dirname,'normalized-resource-result.json'),JSON.stringify(r,null,2)+'\n');saved=true;res.writeHead(200).end('{"saved":true}');}catch{res.writeHead(500).end();}});return;}
  if(req.method!=='GET')return res.writeHead(405).end();
  if(req.url==='/')return res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><meta charset="utf-8"><title>Native resource rendering discriminator</title><p>Saved generated YUV surfaces only</p><script src="/runner.js"></script>');
  const bytes=files[req.url];if(!bytes)return res.writeHead(404).end();let start=0,end=bytes.length-1;
  if(req.headers.range){const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!m)return res.writeHead(416).end();start=+m[1];end=m[2]?Math.min(+m[2],end):end;if(start>end||start>=bytes.length)return res.writeHead(416).end();}
  if((servedBytes+=end-start+1)>4*1024*1024)return res.writeHead(429).end();
  res.writeHead(req.headers.range?206:200,{'Content-Type':req.url.endsWith('.js')?'text/javascript':'video/mp4','Cache-Control':'no-store','Content-Length':end-start+1,
    'Accept-Ranges':'bytes',...(req.headers.range?{'Content-Range':`bytes ${start}-${end}/${bytes.length}`}:{})});res.end(bytes.subarray(start,end+1));
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port,binding,loopbackOnly:true,requestCap:64,byteCap:4*1024*1024})));
for(const signal of['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
