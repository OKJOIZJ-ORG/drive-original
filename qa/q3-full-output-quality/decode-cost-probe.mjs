// Offline narrow causal probe only: no encoder/browser/worker/network/full conversion.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {readQ3Input,inspectQ3Packet} from '../../media/video-q3-input.mjs';
import {createGeneralSource} from '../../media/general-source.mjs';
import createModule from '../../media/video-q3-codec.mjs';
const bytes=fs.readFileSync(new URL('../q3-product-integration/synthetic-640-180s.mp4',import.meta.url)),wasm=fs.readFileSync(new URL('../../media/video-q3-codec.wasm',import.meta.url)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const result={scope:'Offline first300pictures product WASM decoder/cache cost; no native encoder, worker RPC, HTTP/Drive, MSE, Android or realtime qualification',producerSha256:sha(fs.readFileSync(new URL(import.meta.url))),inputSha256:sha(bytes),wasmSha256:sha(wasm),node:process.version,frames:300};
const rpc=createGeneralSource({identity:{size:bytes.length},read:async({start,end})=>bytes.subarray(start,end+1),abort:async()=>({settled:true})});
let m,decoder,extra,packet,raw;let exactMs=0,decodeCopyMs=0,jsInspectCopyMs=0;
try{const input=await readQ3Input(rpc);rpc.beginStreaming();m=await createModule({wasmBinary:wasm});extra=m._malloc(input.extradata.length);packet=m._malloc(1048576);raw=m._malloc(640*360*3/2);m.HEAPU8.set(input.extradata,extra);decoder=m._q3_open(extra,input.extradata.length);if(!decoder)throw Error('DECODER_INIT');
 const start=performance.now();for(const p of input.packets.slice(0,300)){let t=performance.now();const b=await rpc.exact(p.start,p.size);exactMs+=performance.now()-t;t=performance.now();inspectQ3Packet(b,p.key);m.HEAPU8.set(b,packet);jsInspectCopyMs+=performance.now()-t;t=performance.now();if(m._q3_send(decoder,packet,p.size,0)<0||m._q3_receive(decoder)<0||m._q3_picture_metadata(decoder)!==1||m._q3_width(decoder)!==640||m._q3_height(decoder)!==360||m._q3_format(decoder)!==0||m._q3_copy(decoder,raw,345600)!==345600||m._q3_packet_drained(decoder)!==1)throw Error('DECODE_UNQUALIFIED');decodeCopyMs+=performance.now()-t;}
 result.elapsedMs=performance.now()-start;result.timingMs={exactCachedRead:exactMs,packetInspectHeapCopy:jsInspectCopyMs,wasmDecodeMetadataRawCopy:decodeCopyMs};result.meanDecodeCopyMs=decodeCopyMs/300;result.localCacheStats={...rpc.metrics};result.wasmHeapBytes=m.HEAPU8.byteLength;result.pass=true;
}catch(e){result.error=e.message;result.pass=false;}finally{if(m){if(decoder)m._q3_close(decoder);for(const p of [extra,packet,raw])if(p)m._free(p);}result.cleanup=await rpc.cleanup();fs.writeFileSync(new URL('./decode-cost-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
if(!result.pass)process.exitCode=1;
