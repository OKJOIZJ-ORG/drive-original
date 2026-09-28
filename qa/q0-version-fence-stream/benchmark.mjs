import {performance} from 'node:perf_hooks';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {openNativeFence} from './owner.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const rows=[];
for(const metadataLatencyMs of [0,25]){
 const start=performance.now();let metadataRequests=0,rangeRequests=0;
 const owner=await openNativeFence({fileId:'synthetic',accountKey:'synthetic',accountGeneration:1,isCurrent:()=>true,requestTimeoutMs:2000,
  async readMetadata(){metadataRequests++;if(metadataLatencyMs)await delay(metadataLatencyMs);return {id:'synthetic',size:String(4*1048576),mimeType:'video/mp4',modifiedTime:'fixed',headRevisionId:'A',version:'1',capabilities:{canDownload:true},trashed:false};},
  async readRange({start,end}){rangeRequests++;if(metadataLatencyMs)await delay(10);return new Response(new Uint8Array(end-start+1),{status:206,headers:{'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${4*1048576}`}});}});
 const reader=owner.response().body.getReader();let first=null,total=0;
 for(;;){const item=await reader.read();if(item.done)break;if(first===null)first=performance.now()-start;total+=item.value.length;}
 const elapsed=performance.now()-start,stats=owner.stats(),cleanup=await owner.close();
 rows.push({metadataLatencyMs,rangeLatencyMs:metadataLatencyMs?10:0,bytes:total,firstChunkMs:first,elapsedMs:elapsed,metadataRequests,rangeRequests,peakSourceHeldBytes:stats.source.peakRetainedBytes,cleanup});
}
const sha=p=>createHash('sha256').update(readFileSync(new URL(p,import.meta.url))).digest('hex');
const result={kind:'Node native Response/ReadableStream, synthetic callbacks; not browser or Google throughput',node:process.version,rows,hashes:{owner:sha('./owner.mjs'),source:sha('../../media/drive-source.mjs'),benchmark:sha('./benchmark.mjs')}};
writeFileSync(new URL('./benchmark-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
