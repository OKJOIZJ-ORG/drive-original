(()=>{
if(window.__driveNightCorpus)throw Error('QA_OWNER_EXISTS');
const expected={'sw-proof.expression.js':'485320cc6ab312ba026080e7fc1540bd2a9c39fca34d8aa5261bb242b9426f30','factory.expression.js':'d04cfd243c9767e70f622fb0370aecbad393c829f6e6a567b4ff50521219f2bc','observer.expression.js':'4a2107c7ebab5ab8aeceb1513b0b040869b28ca62a9432d6b0430cf692c293eb','browser.expression.js':'817404e71dd443796c35b2557bb9ee4007a010b645dd72b115185365b0c49a5e'};
const o={ready:false,loaded:[],failure:null};window.__driveNightCorpus=o;
const frame=document.createElement('iframe');frame.id='driveNightFileInput24';frame.src='about:blank';document.body.append(frame);
const doc=frame.contentDocument,input=doc.createElement('input');input.type='file';input.multiple=true;input.id='driveNightLocalFiles';doc.body.append(input);
input.onchange=async()=>{try{const entries=[];for(const f of input.files){if(!expected[f.name])throw Error('QA_FILE_REJECTED');const b=await f.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==expected[f.name])throw Error('QA_FILE_HASH');entries.push({name:f.name,text:new TextDecoder().decode(b)});}if(entries.length!==4)throw Error('QA_FILE_COUNT');for(const e of entries){const value=window.eval(e.text);if(e.name==='sw-proof.expression.js')o.proof=value;else if(e.name==='factory.expression.js')o.factory=value;else if(e.name==='observer.expression.js')o.renewal=value;else o.security=value;o.loaded.push(e.name);}o.ready=true;}catch(e){o.failure=/^QA_[A-Z_]+$/.test(e.message)?e.message:'QA_LOAD_FAILED';}finally{input.value='';frame.remove();}};
return{prepared:true,networkUpload:false};
})()
