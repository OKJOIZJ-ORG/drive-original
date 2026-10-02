'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const files={'/source.mp4':fs.readFileSync(path.join(root,'qa/fm05-controlled-diagnostic/subtitle.mp4')),'/remux.mp4':fs.readFileSync(path.join(root,'qa/player-track-endpoint/fixed-q1-output.mp4')),'/runner.js':fs.readFileSync(path.join(__dirname,'mse-only.function.js'))};
const binding=Object.fromEntries(Object.entries(files).map(([name,b])=>[name,{bytes:b.length,sha256:hash(b)}]));
let requests=0,servedBytes=0,failedBound=false,resultSaved=false;
const server=http.createServer((req,res)=>{
 requests++;if(requests>128)return failedBound=true,res.writeHead(429).end();
 if(req.url==='/result'&&req.method==='POST'){const chunks=[];let n=0;req.on('data',b=>{n+=b.length;if(n>2*1024*1024){failedBound=true;req.destroy();return;}chunks.push(b);});req.on('end',()=>{try{if(resultSaved)throw Error('COLOR_RESULT_NO_OVERWRITE');const r=JSON.parse(Buffer.concat(chunks));r.binding=binding;r.server={requests,servedBytes,failedBound};for(const item of (r.cases||[{label:'mse-only',canvas:r.canvas}])){if(item.canvas?.png){fs.writeFileSync(path.join(__dirname,item.label+'.png'),Buffer.from(item.canvas.png.split(',')[1],'base64'));delete item.canvas.png;}}fs.writeFileSync(path.join(__dirname,'mse-only-attempt2-result.json'),JSON.stringify(r,null,2)+'\n');resultSaved=true;res.writeHead(200,{'Content-Type':'application/json'}).end('{"saved":true}');}catch{res.writeHead(500).end();}});return;}
 if(req.method!=='GET')return res.writeHead(405).end();
 if(req.url==='/')return res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'}).end('<!doctype html><meta charset="utf-8"><title>Controlled file/MSE color discriminator</title><h1>Controlled file/MSE color discriminator</h1><p>Exact generated fixture; no account or original-media changes.</p><script src="/runner.js"></script>');
 const bytes=files[req.url];if(!bytes)return res.writeHead(404).end();let start=0,end=bytes.length-1;const range=req.headers.range;
 if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);if(!m)return res.writeHead(416).end();start=+m[1];end=m[2]?Math.min(+m[2],end):end;if(start>end||start>=bytes.length)return res.writeHead(416).end();}
 servedBytes+=end-start+1;if(servedBytes>8*1024*1024)return failedBound=true,res.writeHead(429).end();
 res.writeHead(range?206:200,{'Content-Type':req.url.endsWith('.js')?'text/javascript':'video/mp4','Cache-Control':'no-store','Content-Length':end-start+1,'Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${start}-${end}/${bytes.length}`}:{})});res.end(bytes.subarray(start,end+1));
});
server.listen(0,'127.0.0.1',()=>{console.log(JSON.stringify({port:server.address().port,binding,requestCap:128,byteCap:8*1024*1024,loopbackOnly:true}));});
process.on('SIGINT',()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
process.on('SIGTERM',()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
