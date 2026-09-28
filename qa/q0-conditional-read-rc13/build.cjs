'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const origin=path.join(__dirname,'../v2-07b-ts-q1/clock-live.function.js');
let base=fs.readFileSync(origin,'utf8');
base=base.slice(0,base.indexOf('  const execute=async()=>{'));
base=base.replace('function (selected, clock, swProof)','function (selected, swProof)')
 .replace("typeof clock!=='function'||",'')
 .replace('Number(fileSnapshot.size)<=524144||Number(fileSnapshot.size)%188!==0','Number(fileSnapshot.size)<=2')
 .replaceAll('1.22.0-rc.11','1.22.0-rc.13')
 .replace('owner={account:', 'owner={caps:state.authCapabilities,account:')
 .replace("&&state.authStatus==='online'", "&&state.authCapabilities===owner.caps&&owner.caps?.version===1&&owner.caps.driveRead===true&&owner.caps.appData===true\n    &&state.authStatus==='online'")
 .replace("source=null,timeout=null",'source=null,timeout=null')
 .replace('drive-original.clock-live-rc11/1','drive-original.q0-conditional-read-rc13/1')
 .replace('clock:null,sourceCleanup:null',"results:[],etagExposed:false,strongEtag:false,conditionalSupported:null,sourceCleanup:null")
 .replace('summary.metadataRequests>5','summary.metadataRequests>6');
const tail=fs.readFileSync(path.join(__dirname,'tail.js'),'utf8');
const output='('+base+tail+')';
fs.writeFileSync(path.join(__dirname,'facade.expression.js'),output);
fs.writeFileSync(path.join(__dirname,'provenance.json'),JSON.stringify({fixedGitSHA:'570f9c38506d1e426c33cf65b73836d32bf872c0',basePath:'qa/v2-07b-ts-q1/clock-live.function.js',baseSHA256:sha(fs.readFileSync(origin)),producerSHA256:sha(fs.readFileSync(__filename)),tailSHA256:sha(tail),outputSHA256:sha(output),outputBytes:Buffer.byteLength(output)},null,2)+'\n');
console.log(sha(output));
