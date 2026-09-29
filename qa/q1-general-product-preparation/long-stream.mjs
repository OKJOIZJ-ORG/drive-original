import {open,stat,writeFile} from 'node:fs/promises';
import {streamGeneralQ1} from '../../media/general-pipeline.mjs';
const name='qa/q1-general-product-preparation/long.ts',fd=await open(name),size=(await stat(name)).size;let closed=false,maxRead=0;
const source={identity:{size},async read({start,end}){if(closed)throw Error('CLOSED');const b=new Uint8Array(end-start+1);maxRead=Math.max(maxRead,b.length);const r=await fd.read(b,0,b.length,start);if(r.bytesRead!==b.length)throw Error('SHORT');return b;},async abort(){if(!closed){closed=true;await fd.close();}return{settled:true};}};
const result=await streamGeneralQ1({source,onChunk:()=>{}});await writeFile('qa/q1-general-product-preparation/long-stream-results.json',JSON.stringify({size,maxRead,closed,result},null,2));console.log(JSON.stringify({size,maxRead,packets:result.packets,outputBytes:result.outputBytes,retention:result.muxRetention,reads:result.reads,cleanup:result.cleanup}));
