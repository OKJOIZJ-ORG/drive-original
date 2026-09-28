// Build a derived, compact metadata tree. Sample tables/payloads are never read.
export const SPARSE_LIMITS=Object.freeze({bytes:2*1024*1024,requests:64,boxes:256,tracks:32,descriptions:16,configBytes:256*1024});
const stop=code=>{throw Object.assign(new Error(code),{code});};
const video=new Set(['avc1','avc3','hvc1','hev1','av01','vp09','encv']);
const audio=new Set(['mp4a','Opus','ac-3','ec-3','alac','fLaC','enca']);
const configs=new Set(['avcC','hvcC','av1C','vpcC','esds','dOps','dac3','dec3','alac','dfLa','pasp']);
const tableTypes=new Set(['stts','ctts','cslg','stsc','stsz','stz2','stco','co64','stss','stsh','padb','stdp','sdtp','sbgp','sgpd','subs','saiz','saio','senc']);
const uint=b=>{let n=0n;for(const v of b)n=(n<<8n)|BigInt(v);return n;};
const concat=parts=>{const size=parts.reduce((n,v)=>n+v.length,0),out=new Uint8Array(size);let p=0;for(const v of parts){out.set(v,p);p+=v.length;}return out;};
const pack=(type,parts=[])=>{const body=concat(parts),out=new Uint8Array(body.length+8),view=new DataView(out.buffer);view.setUint32(0,out.length);for(let i=0;i<4;i++)out[4+i]=type.charCodeAt(i);out.set(body,8);return out;};

export async function readSparseMoov({box,fileSize,read,signal,limits:overrides={}}={}){
  const metrics={requests:0,receivedBytes:0,boxes:0,tracks:0,descriptions:0,sampleTableBoxesSkipped:0,unknownPayloadsSkipped:0,fixedLeafSuffixesSkipped:0,originalBoundsValidated:false,derivedBytes:0};
  let limits=null;
  const check=()=>{if(signal?.aborted)stop('SPARSE_ABORTED');};
  const result=(status,code,bytes=null)=>({status,code,bytes,metrics:{...metrics},derivedStructuralMetadata:true,originalSampleTablesRead:false,containerValidityProven:false});
  try{
    limits=Object.fromEntries(Object.entries(SPARSE_LIMITS).map(([k,v])=>{const n=overrides[k]??v;if(!Number.isSafeInteger(n)||n<1||n>v)stop('SPARSE_INVALID_LIMIT');return [k,n];}));
    if(typeof read!=='function')stop('SPARSE_INVALID_ARGUMENT');
    const size=BigInt(fileSize),start=BigInt(box.offset),end=BigInt(box.endExclusive),declared=BigInt(box.size),head=BigInt(box.headerBytes);
    if(size>BigInt(Number.MAX_SAFE_INTEGER)||start<0n||end>size||declared!==end-start||head<8n||head>16n||declared<head)stop('SPARSE_INVALID_BOUNDS');
    const bytes=async(p,n,bound)=>{
      check();if(!Number.isSafeInteger(n)||n<1||p<start||p+BigInt(n)>bound||bound>end)stop('SPARSE_INVALID_BOUNDS');
      if(metrics.requests>=limits.requests)stop('SPARSE_REQUEST_LIMIT');if(metrics.receivedBytes+n>limits.bytes)stop('SPARSE_BYTE_LIMIT');metrics.requests++;
      const pending=Promise.resolve().then(()=>{check();return read({start:p,end:p+BigInt(n)-1n});});
      let value;
      if(!signal)value=await pending;
      else value=await new Promise((resolve,reject)=>{const onAbort=()=>finish(reject,Object.assign(new Error('SPARSE_ABORTED'),{code:'SPARSE_ABORTED'}));const finish=(fn,v)=>{signal.removeEventListener('abort',onAbort);fn(v);};signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();pending.then(v=>finish(resolve,v),e=>finish(reject,e));});
      check();
      if(!(value instanceof Uint8Array)||value.length!==n)stop('SPARSE_READ_LENGTH');metrics.receivedBytes+=value.length;return value;
    };
    const header=async(p,bound)=>{
      if(++metrics.boxes>limits.boxes)stop('SPARSE_BOX_LIMIT');
      const b=await bytes(p,8,bound),raw=Number(uint(b.subarray(0,4))),type=String.fromCharCode(...b.subarray(4));let h=8n,n=BigInt(raw);
      if(raw===1){n=uint(await bytes(p+8n,8,bound));h=16n;}else if(raw===0)n=bound-p;
      if(type==='uuid')h+=16n;
      if(n<h||p+n>bound||p+n>size)stop('SPARSE_INVALID_BOX');
      return {type,start:p,body:p+h,end:p+n,size:n,head:h};
    };
    const fixed=async(b)=>{
      const prefix=await bytes(b.body,4,b.end),v=prefix[0];let n;
      if(b.type==='tkhd'){if(v>1)stop('SPARSE_UNSUPPORTED_VERSION');n=v===1?96:84;}
      else if(b.type==='mdhd'){if(v>1)stop('SPARSE_UNSUPPORTED_VERSION');n=v===1?36:24;}
      else {if(v!==0)stop('SPARSE_UNSUPPORTED_VERSION');n=12;}
      const rest=await bytes(b.body+4n,n-4,b.end);if(b.body+BigInt(n)<b.end)metrics.fixedLeafSuffixesSkipped++;
      return pack(b.type,[prefix,rest]);
    };
    const stsd=async(b)=>{
      const prefix=await bytes(b.body,8,b.end);if(prefix[0]!==0)stop('SPARSE_UNSUPPORTED_VERSION');const count=Number(uint(prefix.subarray(4)));
      if(count<1||count>limits.descriptions)stop('SPARSE_DESCRIPTION_LIMIT');let p=b.body+8n;const entries=[];
      for(let i=0;i<count;i++){
        const e=await header(p,b.end);metrics.descriptions++;const n=video.has(e.type)?78:audio.has(e.type)?28:0;
        if(!n)stop('SPARSE_UNSUPPORTED_ENTRY');
        const entry=await bytes(e.body,n,e.end);if(audio.has(e.type)&&uint(entry.subarray(8,10))!==0n)stop('SPARSE_UNSUPPORTED_AUDIO_VERSION');
        let c=e.body+BigInt(n);const leaves=[entry];
        while(c<e.end){
          const child=await header(c,e.end),length=child.end-child.body;
          if(configs.has(child.type)){
            if(length>BigInt(limits.configBytes))stop('SPARSE_CONFIG_LIMIT');
            leaves.push(pack(child.type,length?[await bytes(child.body,Number(length),child.end)]:[]));
          }else if(child.type==='sinf'||child.type==='colr'){
            metrics.unknownPayloadsSkipped++;leaves.push(pack(child.type));
          }else{metrics.unknownPayloadsSkipped++;leaves.push(pack('free'));}
          c=child.end;
        }
        entries.push(pack(e.type,leaves));p=e.end;
      }
      if(p!==b.end)stop('SPARSE_DESCRIPTION_COUNT');return pack('stsd',[prefix,...entries]);
    };
    const grammar={moov:new Set(['trak']),trak:new Set(['mdia']),mdia:new Set(['minf']),minf:new Set(['stbl']),stbl:new Set()};
    const allowedLeaves={moov:new Set(),trak:new Set(['tkhd']),mdia:new Set(['mdhd','hdlr']),minf:new Set(),stbl:new Set(['stsd'])};
    const walk=async(type,body,bound,depth)=>{
      check();if(depth>5)stop('SPARSE_DEPTH');let p=body;const output=[];
      while(p<bound){
        const child=await header(p,bound);
        if(grammar[type].has(child.type)){
          if(child.type==='trak'&&++metrics.tracks>limits.tracks)stop('SPARSE_TRACK_LIMIT');
          output.push(await walk(child.type,child.body,child.end,depth+1));
        }else if(allowedLeaves[type].has(child.type))output.push(child.type==='stsd'?await stsd(child):await fixed(child));
        else if((type==='moov'&&child.type==='mvex')||(type==='trak'&&child.type==='edts')){metrics.unknownPayloadsSkipped++;output.push(pack(child.type));}
        else if(type==='stbl'&&tableTypes.has(child.type))metrics.sampleTableBoxesSkipped++;
        else metrics.unknownPayloadsSkipped++;
        p=child.end;
      }
      return pack(type,output);
    };
    // Reuse the root scanner's identity-fenced validated header; do not reread it.
    const derived=await walk('moov',start+head,end,0);check();if(derived.length>limits.bytes)stop('SPARSE_DERIVED_LIMIT');
    metrics.originalBoundsValidated=true;metrics.derivedBytes=derived.length;
    return result('complete','SPARSE_STRUCTURAL_METADATA',derived);
  }catch(e){return result('incomplete',typeof e?.code==='string'&&e.code.startsWith('SPARSE_')?e.code:'SPARSE_READER_FAILURE');}
}
