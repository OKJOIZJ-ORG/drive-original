'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),source28=process.argv[2],source27='05661e05774b723246fe652914b393f279f019df';assert.match(source28??'',/^[a-f0-9]{40}$/);assert.notEqual(source28,source27);
const blob=(s,p)=>execFileSync('git',['show',`${s}:${p}`],{cwd:root,maxBuffer:12*1024*1024}),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const versions=[source27,source28].map((source,i)=>{const version=JSON.parse(blob(source,'version.json')).version;assert.equal(version,'1.22.0-rc.'+(27+i));
 const match=blob(source,'sw.js').toString().match(/const SHELL_FILES = (\[[\s\S]*?\]);/);assert(match);const names=[...vm.runInNewContext(match[1],{},{timeout:1000})].filter(f=>f!=='./').map(f=>f.slice(2));assert.equal(names.length,40);
 return {source,version,sourceSHA256:Object.fromEntries(['app.js','sw.js','version.json','media/general-player.mjs'].map(p=>[p,hash(blob(source,p))])),cached:names.map(file=>({file,sha256:hash(blob(source,file))}))};});
const binding={schema:'drive-original.actual-https-update-binding/1',origin:'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev',versions};
const factory=fs.readFileSync(path.join(__dirname,'journal.function.js'),'utf8');
for(const[kind,name]of [['new-document','init.expression.js'],['late-attach','late-attach.expression.js']]){const code=`(${factory})(${JSON.stringify(binding)},${JSON.stringify(kind)})\n`;new vm.Script(code);fs.writeFileSync(path.join(__dirname,name),code);}
fs.writeFileSync(path.join(__dirname,'binding.json'),JSON.stringify(binding,null,2)+'\n');
const init=fs.readFileSync(path.join(__dirname,'init.expression.js'),'utf8');
const requests={install:{method:'Page.addScriptToEvaluateOnNewDocument',params:{source:init}},read:{method:'Runtime.evaluate',params:{expression:'('+fs.readFileSync(path.join(__dirname,'reader.function.js'),'utf8')+')()',awaitPromise:true,returnByValue:true}},
 cleanup:{method:'Runtime.evaluate',params:{expression:'('+fs.readFileSync(path.join(__dirname,'cleanup.function.js'),'utf8')+')()',awaitPromise:true,returnByValue:true}},
 remove:{method:'Page.removeScriptToEvaluateOnNewDocument',params:{identifier:'REPLACE_WITH_ACTUAL_INSTALL_RESULT_IDENTIFIER'}}};
fs.writeFileSync(path.join(__dirname,'protocol-requests.json'),JSON.stringify(requests,null,2)+'\n');
console.log(JSON.stringify({bound:true,source27,source28,versions:versions.map(v=>v.version),initSHA256:hash(Buffer.from(init)),browserExecuted:false}));
