(() => {
  if(APP_VERSION!=='1.22.0-rc.19'||window.__rc19PointerQA)throw Error('QA_VERSION_OWNER_REQUIRED');
  const video=el.videoPlayer,player=q1Playback?.player,account=state.accountId,file=state.selected?.id,session=state.mediaSession,base=performance.now();
  const current=()=>state.accountId===account&&state.selected?.id===file&&state.mediaSession===session&&q1Playback?.player===player&&isCurrentMediaEvent(video);
  if(!current()||!video.paused||!el.playerModal.classList.contains('controls-idle'))throw Error('QA_PAUSED_HIDDEN_REQUIRED');
  let done=false,timer=null;const rows=[],initialTime=video.currentTime;
  const add=(stage,detail={})=>{if(rows.length<32)rows.push({stage,ms:Math.round((performance.now()-base)*10)/10,...detail});};
  const move=e=>{if(!e.isTrusted)return;add('pointer-move',{trusted:true,bottom:isPlayerBottomActivation(e.clientX,e.clientY),overChrome:playerChrome.contains(e.target),ownerCurrent:current()});};
  const action=e=>add(e.type,{trusted:e.isTrusted});
  const observer=new MutationObserver(()=>add('controls-state',{hidden:el.playerModal.classList.contains('controls-idle'),ownerCurrent:current()}));
  const clear=()=>{if(done)return;done=true;clearTimeout(timer);observer.disconnect();el.playerModal.removeEventListener('pointermove',move);['pointerdown','click','keydown'].forEach(n=>document.removeEventListener(n,action,true));['play','pause','seeking'].forEach(n=>video.removeEventListener(n,action));};
  window.__rc19PointerQA={read:()=>({done,ownerCurrent:current(),initialTime,time:video.currentTime,paused:video.paused,hidden:el.playerModal.classList.contains('controls-idle'),rows:rows.map(x=>({...x}))}),clear};
  observer.observe(el.playerModal,{attributes:true,attributeFilter:['class']});el.playerModal.addEventListener('pointermove',move);
  ['pointerdown','click','keydown'].forEach(n=>document.addEventListener(n,action,true));['play','pause','seeking'].forEach(n=>video.addEventListener(n,action));timer=setTimeout(clear,3000);add('armed',{hidden:true});return {armed:true,ownerCurrent:current()};
})()
