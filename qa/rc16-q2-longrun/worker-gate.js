// QA startup handshake only. Product worker bytes and message values unchanged.
(() => {
 const NativeWorker=Worker,rows=new Map();let serial=0;
 window.Worker=class extends NativeWorker{
  constructor(url,...rest){super(url,...rest);if(['/media/general-worker.mjs','/media/audio-general-worker.mjs'].includes(new URL(url,location.href).pathname)){
   const row={id:++serial,worker:this,armed:false,queued:[],generation:null};this.qaLongWorkerId=row.id;rows.set(row.id,row);
  }}
  postMessage(message,...rest){const row=rows.get(this.qaLongWorkerId);if(row&&!row.armed){if(message?.kind==='start')row.generation=message.generation;row.queued.push([message,rest]);return;}return super.postMessage(message,...rest);}
  terminate(){rows.delete(this.qaLongWorkerId);return super.terminate();}
 };
 window.qaQueuedGeneralWorker=()=>{const row=[...rows.values()].find(r=>!r.armed);return row?{id:row.id,generation:row.generation,queued:row.queued.length}:null;};
 window.qaArmGeneralWorker=id=>{const row=rows.get(id);if(!row)throw Error('QA_WORKER_GATE_GONE');row.armed=true;for(const [message,args] of row.queued)NativeWorker.prototype.postMessage.call(row.worker,message,...args);row.queued.length=0;};
})();
