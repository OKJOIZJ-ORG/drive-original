'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function make(){
 const files=new Map(),source=fs.readFileSync(path.join(root,'qa/fm05-controlled-diagnostic/subtitle.mp4'));
 if(source.length!==659966||sha(source)!=='d9a1cc3f12a7a3b3a91f408e59da8e1f9b8dfb2e4ec26dd8d969cedc27893037')throw Error('FIXTURE_BINDING_MISMATCH');
 for(const file of require('../../scripts/public-files.cjs').filter(f=>f.startsWith('media/')&&f.endsWith('.mjs')))files.set('/'+file,fs.readFileSync(path.join(root,file)));
 files.set('/source.mp4',source);files.set('/runner.js',fs.readFileSync(path.join(__dirname,'android-tuple-observer.function.js')));
 const binding={predicate:JSON.parse(fs.readFileSync(path.join(__dirname,'android-tuple-predicate.json'))),source:{bytes:source.length,sha256:sha(source)},selectedAudioTrackId:2,sourceDeclaration:'ABSENT',servedWorkingTree:true,producers:[...files].filter(([p])=>p!=='/source.mp4').map(([p,b])=>({path:p,bytes:b.length,sha256:sha(b)}))};
 const state={requests:0,servedBytes:0,failedBound:false,unexpectedPath:0,result:null};
 const server=http.createServer((req,res)=>{if(++state.requests>512){state.failedBound=true;return res.writeHead(429).end();}
  if(req.url==='/result'&&req.method==='POST'){let n=0,chunks=[];req.on('data',b=>{if((n+=b.length)>1024*1024){state.failedBound=true;req.destroy();return;}chunks.push(b);});req.on('end',()=>{try{if(state.result)throw Error('DUPLICATE_RESULT');state.result=JSON.parse(Buffer.concat(chunks));res.writeHead(200).end('{}');}catch{res.writeHead(500).end();}});return;}
  if(req.method!=='GET')return res.writeHead(405).end();
  if(req.url==='/binding')return res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(binding));
  if(req.url==='/')return res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Owned generated color fixture</title><script src="/runner.js"></script>');
  if(req.url==='/favicon.ico')return res.writeHead(204).end();const bytes=files.get(req.url);if(!bytes){state.unexpectedPath++;return res.writeHead(404).end();}let start=0,end=bytes.length-1;
  if(req.headers.range){const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!m)return res.writeHead(416).end();start=+m[1];end=m[2]?Math.min(+m[2],end):end;if(start>end||start>=bytes.length)return res.writeHead(416).end();}
  state.servedBytes+=end-start+1;if(state.servedBytes>16*1024*1024){state.failedBound=true;return res.writeHead(429).end();}
  res.writeHead(req.headers.range?206:200,{'Content-Type':req.url.endsWith('.mp4')?'video/mp4':'text/javascript','Cache-Control':'no-store','Content-Length':end-start+1,'Accept-Ranges':'bytes',...(req.headers.range?{'Content-Range':`bytes ${start}-${end}/${bytes.length}`}:{})});res.end(bytes.subarray(start,end+1));
 });
 return{server,state,binding,checkStable:()=>binding.producers.every(p=>sha(fs.readFileSync(p.path==='/runner.js'?path.join(__dirname,'android-tuple-observer.function.js'):path.join(root,p.path.slice(1))))===p.sha256)&&sha(fs.readFileSync(path.join(root,'qa/fm05-controlled-diagnostic/subtitle.mp4')))===binding.source.sha256};
}
module.exports={make,sha};
