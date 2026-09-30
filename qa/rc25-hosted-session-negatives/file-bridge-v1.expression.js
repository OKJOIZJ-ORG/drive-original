(()=>{
if(window.__driveNightCorpus)throw Error('QA_OWNER_EXISTS');
const expected={"sw-proof.expression.js":"33f88d6e79ba44f5e6f6960147f31525d144e20cd0e3577097f640b2cec471f1","factory.expression.js":"92cfd5340b77e0a83720315f46d95c35d5fbf5204f6e7955f69a95294f042f16","observer.expression.js":"366a4b7774452a887b08d698fe4dd5c54872ddc08c3024a778ae3ffb7902afc9","future-stage-owner-fields.expression.js":"b64dec9ac102ea77893422d667f6deccf08f88957b6913ea0151169117cf00b7"};
const o={ready:false,loaded:[],failure:null};window.__driveNightCorpus=o;
const frame=document.createElement('iframe');frame.id='driveNightFileInput25';frame.src='about:blank';document.body.append(frame);
const doc=frame.contentDocument,input=doc.createElement('input');input.type='file';input.multiple=true;input.id='driveNightLocalFiles';doc.body.append(input);
input.onchange=async()=>{try{const entries=[];for(const f of input.files){if(!expected[f.name])throw Error('QA_FILE_REJECTED');const b=await f.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==expected[f.name])throw Error('QA_FILE_HASH');entries.push({name:f.name,text:new TextDecoder().decode(b)});}if(entries.length!==4)throw Error('QA_FILE_COUNT');for(const e of entries){const value=window.eval(e.text);if(e.name==='sw-proof.expression.js')o.proof=value;else if(e.name==='factory.expression.js')o.factory=value;else if(e.name==='observer.expression.js')o.performanceFactory=value;else o.security=value;o.loaded.push(e.name);}o.ready=true;}catch(e){o.failure=/^QA_[A-Z_]+$/.test(e.message)?e.message:'QA_LOAD_FAILED';}finally{input.value='';frame.remove();}};
return{prepared:true,networkUpload:false};
})()
