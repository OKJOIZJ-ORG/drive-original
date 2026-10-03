// Temporary, byte-bound local module substitution, without publishing or changing SW caches.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'), entry='media/audio-general-pipeline.mjs';
const modules={};
function collect(name){
  if(modules[name])return;
  let source=fs.readFileSync(path.join(root,name),'utf8');
  if(name==='media/general-admission.mjs')source=source.replace("else if(t==='dref'){", "else if(t==='dref'){if(body+20<=limit)(globalThis.__iosLocalDrefs??=[]).push({type:type(bytes,body+8),flags:u32(bytes,body+16)});");
  modules[name]=source;
  for(const m of source.matchAll(/from\s*['"](\.[^'"]+)['"]/g))collect(path.posix.normalize(path.posix.join(path.posix.dirname(name),m[1])));
}
collect(entry);
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const planner=app.slice(app.indexOf('async function planPinnedOriginalAudio('),app.indexOf('\nfunction sniffOriginalImageType('));
if(!planner.startsWith('async function')||!planner.includes("import('./media/audio-general-pipeline.mjs')"))throw Error('Planner boundary changed');
const rewritten=planner.replace("import('./media/audio-general-pipeline.mjs')","Promise.resolve(globalThis.__iosLocalProbeModule)")
 .replace('} catch (error) {','} catch (error) { globalThis.__iosLocalProbeFailure={name:error.name,message:error.message,stack:error.stack};');
const actor=fs.readFileSync(process.argv[2],'utf8');
const expression=`(async()=>{
 const modules=${JSON.stringify(modules)},urls=new Map();
 const originalPlanner=planPinnedOriginalAudio;
 const resolve=(name)=>{
   if(urls.has(name))return urls.get(name);
   const source=modules[name].replace(/from\\s*['\"](\\.[^'\"]+)['\"]/g,(whole,relative)=>{
     const p=new URL(relative,'https://local.invalid/'+name).pathname.slice(1);
     return 'from '+JSON.stringify(resolve(p));
   });
   const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.set(name,url);return url;
 };
 try{
  globalThis.__iosLocalProbeModule=await import(resolve(${JSON.stringify(entry)}));
  planPinnedOriginalAudio=${rewritten};
  return await (${actor});
 }finally{planPinnedOriginalAudio=originalPlanner;delete globalThis.__iosLocalProbeModule;delete globalThis.__iosLocalProbeFailure;delete globalThis.__iosLocalDrefs;for(const u of urls.values())URL.revokeObjectURL(u);}
})()`;
fs.writeFileSync(process.argv[3],expression);
console.log(JSON.stringify({modules:Object.keys(modules).length,bundleHash:crypto.createHash('sha256').update(modules['media/mediabunny-q1.mjs']).digest('hex'),nativeTouchesQualified:false,productionDeployment:false}));
