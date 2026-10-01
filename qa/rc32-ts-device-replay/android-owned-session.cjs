'use strict';
// Import is inert. Root owns all actual, explicitly scoped commands.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),readline=require('node:readline');
const qa=path.resolve(__dirname,'..');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function inputFile(command){
 const file=path.resolve(command.path||'');
 if(!file.startsWith(qa+path.sep)||!/^__[A-Za-z0-9_]+$/.test(command.dest||'')||!['script','json'].includes(command.mode))throw Error('OWNED_QA_INPUT_REQUIRED');
 const bytes=fs.readFileSync(file);if(hash(bytes)!==command.sha)throw Error('OWNED_SOURCE_DRIFT');
 return command.mode==='json'?`()=>{window[${JSON.stringify(command.dest)}]=${JSON.stringify(JSON.parse(bytes.toString('utf8')))};return{installed:true};}`
 :`async()=>{window[${JSON.stringify(command.dest)}]=await(${bytes.toString('utf8').trim()});return{installed:true};}`;
}
function nativeInput(command,width,height){
 const point=(x,y)=>Number.isSafeInteger(x)&&Number.isSafeInteger(y)&&x>=0&&y>=0&&x<width&&y<height;
 if(command.op==='tap'&&point(command.x,command.y))return ['shell','input','tap',String(command.x),String(command.y)];
 if(command.op==='swipe'&&point(command.x,command.y)&&point(command.toX,command.toY)&&Number.isSafeInteger(command.ms)&&command.ms>=100&&command.ms<=3000)return ['shell','input','swipe',String(command.x),String(command.y),String(command.toX),String(command.toY),String(command.ms)];
 if(command.op==='key'&&['KEYCODE_BACK','KEYCODE_MOVE_HOME','KEYCODE_MOVE_END','KEYCODE_PAGE_UP','KEYCODE_PAGE_DOWN','KEYCODE_WAKEUP'].includes(command.key))return ['shell','input','keyevent',command.key];
 throw Error('BOUNDED_NATIVE_INPUT_REQUIRED');
}
async function execute(resultName){
 if(!/^actual-android-rc32-[a-z0-9-]+-safe\.json$/.test(resultName||''))throw Error('SAFE_RESULT_NAME_REQUIRED');
 if(fs.existsSync(path.join(__dirname,resultName)))throw Error('RESULT_ALREADY_EXISTS');
 return require('./android-common.cjs')(__filename,resultName,async c=>{
  const screen=c.report.physicalScreen.match(/(\d+)x(\d+)/);if(!screen||c.report.model!=='SM-X800'||c.report.android!=='16')throw Error('EXPECTED_DEVICE_REQUIRED');
  const [width,height]=screen.slice(1).map(Number);
  await c.unmaskNativeVisibility();await c.releaseMcpForNativeLifecycle();
  const admit=await c.evaluateNative(`()=>({sameOrigin:location.origin==='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev',version:APP_VERSION,closed:el.playerSheet.hidden,q0:!!q0Playback,q1:!!q1Playback,accountPresent:!!state.accountId&&!!state.authAccountKey,online:state.authStatus==='online',loading:!!state.loadingFiles,visible:document.visibilityState==='visible',writerIdle:state.accountStateSyncPromise===null&&state.accountStateSyncTimer===null&&state.accountStateSyncRetryTimer===null&&state.accountStateSyncError===null})`);
  c.step('native owned session admission',admit);
  if(!admit.sameOrigin||admit.version!=='1.22.0-rc.32'||!admit.closed||admit.q0||admit.q1||!admit.accountPresent||!admit.online||admit.loading||!admit.writerIdle)throw Error('NATIVE_IDLE_ADMISSION_REQUIRED');
  console.log(JSON.stringify({ready:true,admission:admit}));let operations=0;
  const lines=readline.createInterface({input:process.stdin,terminal:false});
  for await(const line of lines){let command;try{
   command=JSON.parse(line);if(command.op==='close'){c.step('root closed owned session',{operations});break;}
   if(command.op==='eval'){if(typeof command.fn!=='string'||command.fn.length>200000)throw Error('SAFE_FUNCTION_REQUIRED');console.log(JSON.stringify({op:'eval',result:await c.evaluateNative(command.fn)}));}
   else if(command.op==='load')console.log(JSON.stringify({op:'load',result:await c.evaluateNative(inputFile(command))}));
   else if(['tap','swipe','key'].includes(command.op)){c.adb(nativeInput(command,width,height));console.log(JSON.stringify({op:command.op,completed:true}));}
   else throw Error('OWNED_OPERATION_REQUIRED');operations++;
  }catch(e){console.log(JSON.stringify({op:command?.op||null,failed:true,failure:/^[A-Z0-9_]+$/.test(e.message)?e.message:'OWNED_OPERATION_FAILED'}));}}
  lines.close();
 });
}
if(require.main===module)execute(process.argv[2]);
module.exports={inputFile,nativeInput,execute};
