const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const css=JSON.stringify(fs.readFileSync(path.join(root,'styles.css'),'utf8'));
const actor=`(async()=>{
 if(!el.playerSheet.hidden||globalThis.__iosLocalUiCleanup)throw new Error('UI/player ownership conflict');
 const style=document.createElement('style');style.textContent=${css};document.head.append(style);
 const cancel=el.selectionCancelBtn,oldParent=cancel.parentNode,oldNext=cancel.nextSibling;
 const selectAll=el.selectionSelectAllBtn,oldSelectText=selectAll.textContent;
 const added=[],changed=[];let timer;
 globalThis.__iosLocalUiCleanup=()=>{
  clearTimeout(timer);closePlayer({preserveHistory:true});style.remove();
  oldParent.insertBefore(cancel,oldNext);selectAll.textContent=oldSelectText;
  for(const n of added)n.remove();for(const [n,c] of changed)n.className=c;
  delete globalThis.__iosLocalUiCleanup;return true;
 };
 timer=setTimeout(()=>globalThis.__iosLocalUiCleanup?.(),30000);
 try{
  el.selectionToolbar.append(cancel);selectAll.textContent='전체 선택';
  for(const [id,label] of [['shortsFramePrev','이전 프레임'],['shortsFrameNext','다음 프레임']]){
   const b=document.getElementById(id);changed.push([b,b.className]);b.classList.remove('icon');
   const s=document.createElement('span');s.textContent=label;b.append(s);added.push(s);
  }
  openPlayer(state.favoriteFiles[0]);
  const until=Date.now()+12000;while(Date.now()<until&&el.mediaError.hidden&&el.videoPlayer.currentTime<1){await new Promise(r=>setTimeout(r,100));}
  if(!el.mediaError.hidden||el.videoPlayer.readyState<2)throw new Error('UI playback not ready');
  el.videoPlayer.pause();revealPlayerChrome({touch:true});toggleShortsExpand();
  await new Promise(r=>setTimeout(r,300));
  const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};
  const controls=[...el.mobileShortsOverlay.querySelectorAll('button'),el.mobileShortsProgressTrack]
   .filter(n=>n.getClientRects().length&&!n.closest('[hidden]')).map(n=>({id:n.id,rect:rect(n),hit:n.contains(document.elementFromPoint(n.getBoundingClientRect().x+n.getBoundingClientRect().width/2,n.getBoundingClientRect().y+n.getBoundingClientRect().height/2))}));
  return {viewport:[innerWidth,innerHeight],chrome:rect(document.querySelector('.player-chrome')),title:rect(el.playerTitle),menu:rect(el.shortsExpandRow),controls,
    allTargets44:controls.every(c=>c.rect.width>=44&&c.rect.height>=44),
    allHitCenters:controls.every(c=>c.hit),allInViewport:controls.every(c=>c.rect.x>=0&&c.rect.y>=0&&c.rect.right<=innerWidth&&c.rect.bottom<=innerHeight),
    touchAction:getComputedStyle(el.mediaStage).touchAction,layoutOnly:true,productionDeployment:false};
 }catch(e){globalThis.__iosLocalUiCleanup();throw e;}
})()`;
fs.writeFileSync(process.argv[2],actor);
