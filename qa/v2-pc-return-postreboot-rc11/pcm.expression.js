(()=>{
  const button=document.getElementById('brandButton');
  if(!button)throw Error('PCM_USER_GESTURE_TARGET');
  const bytes=new Uint8Array(44+48000*2*2/2),view=new DataView(bytes.buffer);
  const text=(offset,value)=>{for(let i=0;i<value.length;i++)bytes[offset+i]=value.charCodeAt(i);};
  text(0,'RIFF');view.setUint32(4,bytes.length-8,true);text(8,'WAVE');text(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);
  view.setUint32(24,48000,true);view.setUint32(28,192000,true);view.setUint16(32,4,true);view.setUint16(34,16,true);
  text(36,'data');view.setUint32(40,bytes.length-44,true);
  const url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
  const audio=new Audio();audio.preload='none';
  let timer=null,startedAt=null,done=false,revoked=false;
  const events=[],result={passed:false,scope:'Generated half-second stereo48k PCM silence in fresh candidate document; source assigned inside actual click; no original media or output setting changes'};
  const types=['loadedmetadata','canplay','playing','ended','error'];
  const handler=event=>{
    const row={event:event.type,elapsedMs:startedAt===null?null:Math.round(performance.now()-startedAt),time:audio.currentTime,errorCode:audio.error?.code||null};
    const message=audio.error?.message;
    if(typeof message==='string'&&message.length<=512&&!/https?:|blob:|file:|token|Bearer/i.test(message))row.errorMessage=message;
    events.push(row);
    if(event.type==='ended'||event.type==='error'){
      result.passed=event.type==='ended'&&audio.currentTime>=0.25&&!audio.error;done=true;cleanup();
    }
  };
  function cleanup(){for(const type of types)audio.removeEventListener(type,handler);button.removeEventListener('click',start,true);clearTimeout(timer);audio.pause();audio.removeAttribute('src');audio.load();if(!revoked){URL.revokeObjectURL(url);revoked=true;}}
  function start(){startedAt=performance.now();audio.src=url;timer=setTimeout(()=>{done=true;result.failure='PCM_TIMEOUT';cleanup();},4000);audio.play().catch(error=>{events.push({event:'play-rejected',name:error.name});if(!done){done=true;cleanup();}});}
  for(const type of types)audio.addEventListener(type,handler);
  button.addEventListener('click',start,{once:true,capture:true});
  return {poll:()=>({...result,started:startedAt!==null,done,events:events.slice(),revoked}),clear:cleanup};
})()
