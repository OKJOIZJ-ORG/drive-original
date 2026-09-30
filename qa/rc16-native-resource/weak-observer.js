// QA-only wrapper lifetime observer. It never stores native objects strongly
// except exactly one deliberate MediaSource control, released at end of batch.
(() => {
 const rows=[],finalized={mediaSource:0,sourceBuffer:0,worker:0,inert:0};
 const registry=new FinalizationRegistry(type=>finalized[type]++);
 let control=null;
 const track=(object,type)=>{const row={type,ref:new WeakRef(object),closed:0,ended:0,updates:0,lastRanges:[]};rows.push(row);registry.register(object,type);return row;};
 track({synthetic:true},'inert');
 const NativeMS=MediaSource,nativeAdd=NativeMS.prototype.addSourceBuffer,NativeWorker=Worker;
 window.MediaSource=class extends NativeMS{
  constructor(...args){super(...args);const row=track(this,'mediaSource');if(!control)control=this;
   this.addEventListener('sourceclose',()=>row.closed++,{once:true});
   this.addEventListener('sourceended',()=>row.ended++,{once:true});
  }
 };
 NativeMS.prototype.addSourceBuffer=function(...args){const sb=Reflect.apply(nativeAdd,this,args),row=track(sb,'sourceBuffer');
  sb.addEventListener('updateend',function(){row.updates++;try{row.lastRanges=Array.from({length:this.buffered.length},(_,i)=>[this.buffered.start(i),this.buffered.end(i)]);}catch{row.lastRanges=[];}});
  return sb;
 };
 window.Worker=class extends NativeWorker{constructor(...args){super(...args);track(this,'worker');}};
 window.qaReleaseNativeControl=()=>{control=null;};
 window.qaNativeWeakSnapshot=()=>{
  const counts=Object.fromEntries(Object.keys(finalized).map(type=>[type,{created:0,alive:0,collected:0,finalized:finalized[type]}]));
  const alive=[];
  for(const row of rows){const object=row.ref.deref(),count=counts[row.type];count.created++;if(!object){count.collected++;continue;}count.alive++;
   const detail={type:row.type,control:object===control,closedEvents:row.closed,endedEvents:row.ended,updates:row.updates};
   if(row.type==='mediaSource'){detail.readyState=object.readyState;detail.sourceBuffers=object.sourceBuffers.length;}
   if(row.type==='sourceBuffer'){detail.updating=object.updating;try{detail.buffered=Array.from({length:object.buffered.length},(_,i)=>[object.buffered.start(i),object.buffered.end(i)]);}catch{detail.detached=true;}}
   alive.push(detail);
  }
  return {counts,alive,strongControlHeld:control!==null,mediaSourceCloseEvents:rows.filter(r=>r.type==='mediaSource').reduce((n,r)=>n+r.closed,0),mediaSourceEndEvents:rows.filter(r=>r.type==='mediaSource').reduce((n,r)=>n+r.ended,0)};
 };
})();
