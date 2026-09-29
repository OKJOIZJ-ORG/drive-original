// Inspect the actual binary's memory declaration without allocating its heap.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const b=fs.readFileSync(path.join(__dirname,'codec.wasm'));new WebAssembly.Module(b);
let pos=8,memory;
function u(){let v=0,s=0,x;do{x=b[pos++];v+=(x&127)*2**s;s+=7}while(x&128);return v}
while(pos<b.length){const id=b[pos++],size=u(),end=pos+size;if(id===5){const count=u();if(count!==1)throw Error('Q3_WASM_MEMORY_COUNT');const flags=u(),initial=u(),maximum=(flags&1)?u():null;memory={flags,initialPages:initial,maximumPages:maximum,initialBytes:initial*65536,maximumBytes:maximum*65536};}pos=end;}
if(memory?.initialPages!==512||memory.maximumPages!==1024||memory.flags!==1)throw Error('Q3_WASM_MEMORY_BOUND');
const r={pass:true,method:'Actual WASM memory-section inspection; no runtime allocation',sha256:crypto.createHash('sha256').update(b).digest('hex'),bytes:b.length,memory,scope:'Engine memory only; not Chrome/encoder/JS/build total memory',producerSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')};
fs.writeFileSync(path.join(__dirname,'codec-memory-results.json'),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));
