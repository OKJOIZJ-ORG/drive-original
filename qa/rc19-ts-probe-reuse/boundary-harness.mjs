// Exercise actual product probe/source/bootstrap up to the MSE constructor.
// The deliberate boundary stop is a QA condition, not a product decode failure.
import {readFileSync} from 'node:fs';
import {createTsPlayer} from '../../media/ts-player.mjs';
import {openDriveQ1Source} from '../../media/drive-source.mjs';
export const fixture=readFileSync(new URL('../v2-07b-ts-q1/synthetic-bframes-audiolead.ts',import.meta.url));
export async function boundary({fault=null,position=5}={}){
  const log=[],sources=[];let metaCount=0,rangeCount=0,constructions=0,active=true,failed503=false;
  const previous={MediaSource:globalThis.MediaSource,Worker:globalThis.Worker};
  globalThis.MediaSource=class {constructor(){constructions++;throw new Error('QA_MSE_BOUNDARY_STOP');}};
  globalThis.Worker=class {};
  const video=new EventTarget();Object.assign(video,{playbackRate:1,paused:true,currentTime:0,
    disableRemotePlayback:false,getAttribute:()=>null});
  let player;
  try{
    player=createTsPlayer({video,initialTime:position,isCurrent:()=>active,openSource:async({signal})=>{
      const ordinal=sources.length;
      const source=await openDriveQ1Source({fileId:'fixture',accountKey:'synthetic',accountGeneration:1,
        signal,isCurrent:()=>active,readMetadata:async({phase})=>{
          metaCount++;log.push({stage:'metadata',phase,source:ordinal});
          if(fault==='cancel'&&metaCount===4)active=false;
          return {id:'fixture',headRevisionId:fault==='drift'&&metaCount>=4?'B':'A',size:String(fixture.length),
            mimeType:'video/mp2t',modifiedTime:'A',version:String(metaCount),sha256Checksum:'a'.repeat(64),
            trashed:false,capabilities:{canDownload:!(fault==='permission'&&metaCount>=4)}};
        },readRange:async({start,end})=>{
          rangeCount++;log.push({stage:'range',start,end,source:ordinal});
          if(fault==='503'&&!failed503&&rangeCount===2){failed503=true;return new Response(null,{status:503,headers:{'Retry-After':'0'}});}
          const body=fixture.subarray(start,end+1);
          return new Response(body,{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${fixture.length}`,
            'Content-Length':String(body.length)}});
        }});sources.push(source);return source;
    }});
    await player.ready.catch(()=>{});const state=await player.completion();
    return {log,metaCount,rangeCount,constructions,state,sources:sources.map(s=>s.stats())};
  }finally{
    await player?.dispose();globalThis.MediaSource=previous.MediaSource;globalThis.Worker=previous.Worker;
  }
}
