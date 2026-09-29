from pathlib import Path
p=Path('qa/q2-original-end-integrity');s=Path('media/audio-general-pipeline.mjs').read_text().replace("from './","from '../../media/");s=s.replace('      onEncodedPacket(packet, meta) {', '      onEncodedPacket(packet, meta) {\n        if(packet.timestamp>5.94) console.log("OPUS_END",JSON.stringify({timestamp:packet.timestamp,duration:packet.duration}));');s=s.replace('const sample = new AudioSample({...pcm,timestamp:pcm.timestamp-windowOrigin});','''const validFrames=Math.min(pcm.numberOfFrames,Math.round(windowInfo.sourceEndTimestamp*48000)-tick);
        if(validFrames<=0){audioPacket=null;continue;}
        const sample = new AudioSample({...pcm,timestamp:pcm.timestamp-windowOrigin});
        if(validFrames<pcm.numberOfFrames) sample.trim(pcm.timestamp,pcm.timestamp+validFrames/48000);''');(p/'pipeline.mjs').write_text(s)
s=Path('media/audio-general-worker.mjs').read_text().replace("'./audio-general-pipeline.mjs'","'./pipeline.mjs'");(p/'worker.mjs').write_text(s)
s=Path('qa/q2-general-product-integration/native.mjs').read_text().replace('/media/audio-general-worker.mjs','/qa/q2-original-end-integrity/worker.mjs');(p/'native.mjs').write_text(s)
s=Path('qa/q2-general-product-integration/native.cjs').read_text().replace('/qa/q2-general-product-integration/native.mjs','/qa/q2-original-end-integrity/native.mjs');a=s.index("for(const name of ['ac3'");b=s.index('fs.writeFileSync',a);s=s[:a]+'''const r=await page.evaluate(()=>window.runQ2Worker('eac3'));results.push({name:'eac3',...r});console.log('result',r.passed,r.terminal?.error);
'''+s[b:];s=s.replace("page.on('pageerror'","page.on('console',e=>console.log(e.text()));page.on('pageerror'");(p/'native.cjs').write_text(s)
