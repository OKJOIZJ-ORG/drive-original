(()=>{'use strict';
 let input=window.__pcViewportPrivate;if(!input||input.folderPath?.length!==1)throw Error('VIEWPORT_PRIVATE_INPUT_REQUIRED');
 const proof=window.__rc32DeeperSwProof,owner={account:state.accountId,key:state.authAccountKey,drive:state.driveSessionGeneration,auth:state.authGeneration,controller:navigator.serviceWorker.controller,source:mediaSourceGeneration,projection:JSON.stringify(state.accountMediaState),revision:state.accountStateRevision};
 let initial={folder:state.currentFolderId,stack:JSON.stringify(state.folderStack),query:state.query,filter:state.filter,scroll:scrollY},disposed=false,records=[];
 const sourceOK=()=>{const p=proof?.get?.();return p?.sourceCommit==='1d79897fd32c569137cab079bfd93107be2ee33f'&&p.version==='1.22.0-rc.32'&&APP_VERSION===p.version&&p.controller===navigator.serviceWorker.controller&&p.controller===owner.controller;};
 const current=()=>!disposed&&sourceOK()&&state.accountId===owner.account&&state.authAccountKey===owner.key&&state.driveSessionGeneration===owner.drive&&state.authGeneration===owner.auth&&mediaSourceGeneration===owner.source&&JSON.stringify(state.accountMediaState)===owner.projection&&state.accountStateRevision===owner.revision&&el.playerSheet.hidden&&!q0Playback&&!q1Playback;
 if(!current()||input.account.accountId!==owner.account||input.account.authAccountKey!==owner.key||initial.folder!=='root'||initial.query!==''||initial.filter!=='all'||state.loadingFiles)throw Error('VIEWPORT_IDLE_PREFLIGHT');
 const rect=r=>({top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height});
 return Object.freeze({
  record(label){if(!current()||typeof label!=='string'||!/^[-a-z0-9]{1,48}$/.test(label)||records.length>=16)throw Error('VIEWPORT_OBSERVATION_REJECTED');
   const files=filteredAndSortedFiles(),range=computeRenderWindow(files.length,state.renderWindowStart,getGridColumnCount()),columns=getGridColumnCount(),rowHeight=Math.max(1,state.renderRowHeight),grid=el.fileGrid.getBoundingClientRect(),gridTop=grid.top+scrollY,totalRows=Math.ceil(files.length/columns);
   const firstRow=Math.max(0,Math.floor((scrollY-gridTop)/rowHeight)),lastRow=Math.min(totalRows,Math.ceil((scrollY+innerHeight-gridTop)/rowHeight));
   const intersects=files.length>0&&scrollY+innerHeight>gridTop&&scrollY<gridTop+totalRows*rowHeight;
   const cards=[...el.fileGrid.querySelectorAll('.file-card')],ids=cards.map(c=>c.dataset.fileId),visible=cards.filter(c=>{const r=c.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;});
   const expected=files.slice(range.start,range.end).map(f=>f.id),same=ids.length===expected.length&&ids.every((id,i)=>id===expected[i]);
   const x={label,at:new Date().toISOString(),current:true,rootView:state.currentFolderId===initial.folder,targetFolder:state.currentFolderId===input.folderPath[0].id,loading:!!state.loadingFiles,populationComplete:state.populationComplete===true,hasNextPage:!!state.nextPageToken,totalFiles:files.length,columns,rowHeight,renderStart:range.start,renderEnd:range.end,mounted:cards.length,visibleCards:visible.length,cardCapPassed:cards.length<=240,mountedIdentityOrderSame:same,viewportIntersectsGrid:intersects,viewportRows:{start:firstRow,end:lastRow},viewportCovered:!intersects||(firstRow>=Math.floor(range.start/columns)&&lastRow<=Math.ceil(range.end/columns)&&visible.length>0),firstItemMounted:files.length>0&&ids.includes(files[0].id),lastItemMounted:files.length>0&&ids.includes(files.at(-1).id),scrollY,documentHeight:document.scrollingElement.scrollHeight,viewport:{width:innerWidth,height:innerHeight},grid:rect(grid),horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,privateIdentifiersExported:false};
   records.push(x);return x;
  },
  read(){return{schema:'drive-original.rc32-native-viewport/1',sourceCommit:'1d79897fd32c569137cab079bfd93107be2ee33f',version:'1.22.0-rc.32',disposed,records:JSON.parse(JSON.stringify(records)),actualPlaybackCount:0,originalMediaMutated:false,productChanged:false};},
  restored(){return{current:current(),folderSame:state.currentFolderId===initial.folder,stackSame:JSON.stringify(state.folderStack)===initial.stack,querySame:state.query===initial.query,filterSame:state.filter===initial.filter,scrollSame:Math.abs(scrollY-initial.scroll)<=2,loadingInactive:!state.loadingFiles,playerClosed:el.playerSheet.hidden};},
  dispose(){disposed=true;input=null;initial=null;return{disposed:true};}
 });
})()
