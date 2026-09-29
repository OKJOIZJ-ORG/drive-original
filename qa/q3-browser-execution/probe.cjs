const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'../..');
 console.log(fs.readFileSync(path.join(root,'memory/specs/Drive-Original_Sol-Ultra_Implementation-Pack_v3.0_2026-09-19.md'),'utf8').split('\n').slice(993,1021).join('\n'));
 const b=await chromium.launch({channel:'chrome',headless:true});
 try{let p=await b.newPage();
 // WebCodecs requires a secure context; serve an isolated loopback document.
 const http=require('node:http'),s=http.createServer((q,r)=>r.end('<!doctype html>Q3 capability probe'));
 await new Promise(r=>s.listen(0,'127.0.0.1',r));await p.goto(`http://127.0.0.1:${s.address().port}`);
 const result=await p.evaluate(async()=>{let rows=[];for(const codec of ['mp4v.20.9','avc1.42001e','vp8','vp09.00.10.08','av01.0.04M.08']){let x={codec};for(const [name,api,cfg] of [['decoder',VideoDecoder,{codec,codedWidth:320,codedHeight:180}],['encoder',VideoEncoder,{codec,width:320,height:180,bitrate:4000000,framerate:24}]]){try{x[name]=(await api.isConfigSupported(cfg)).supported}catch(e){x[name]=e.name}}x.native=document.createElement('video').canPlayType(`video/mp4; codecs="${codec}"`);rows.push(x)}return rows});
 fs.writeFileSync(path.join(__dirname,'capabilities.json'),JSON.stringify({browser:b.version(),rows:result},null,2)+'\n');console.log(JSON.stringify(result));await new Promise(r=>s.close(r));
 }finally{await b.close()}
})();
