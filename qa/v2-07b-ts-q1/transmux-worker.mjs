// Local QA worker entry: no URL, credential or network capability is exposed
// through its protocol. The parent owns authenticated input and source identity.
import './node_modules/mux.js/dist/mux-mp4.min.js';
import { createTransmuxSession } from './transmux-session.mjs';

let session = null;
self.onmessage = ({data}) => {
  if (!session) {
    if (data?.type !== 'start') return;
    try {
      session = createTransmuxSession({generation:data.generation,sourceSize:data.sourceSize,
        Transmuxer:globalThis.muxjs.Transmuxer,send:(message,transfer)=>self.postMessage(message,transfer)});
      if(session.stats().state==='open')self.postMessage({type:'ready',generation:data.generation});
      else self.close();
    } catch {
      self.postMessage({type:'error',generation:data.generation,code:'WORKER_START_FAILED'});
      self.close();
    }
    return;
  }
  // Read-only QA observation is outside the media protocol and never grants a
  // parser/output credit. One inspected session, no credentials or media bytes.
  if(data?.type==='inspect'&&data.generation===session.stats().generation
    &&Number.isSafeInteger(data.inspectionSequence)&&data.inspectionSequence>0){
    self.postMessage({type:'inspection',generation:data.generation,
      inspectionSequence:data.inspectionSequence,stats:session.stats()});return;
  }
  session.receive(data);
};
