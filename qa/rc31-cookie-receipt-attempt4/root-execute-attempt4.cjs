'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function verify(){const p=JSON.parse(fs.readFileSync(path.join(__dirname,'preparation-freeze.json'),'utf8'));
 if(p.sourceCommit!=='4a484e6f839d2e6c3eb83503acb08147362cb011'||p.actualExecution!==false)throw Error('PREPARATION_MANIFEST');
 for(const row of p.files){const b=fs.readFileSync(path.resolve(__dirname,row.path));if(b.length!==row.bytes||crypto.createHash('sha256').update(b).digest('hex')!==row.sha256)throw Error('PREPARATION_DRIFT');}return{verified:true,files:p.files.length,actualExecution:false};}
async function execute(privateFile,resultName='actual-android-cookie-gate-attempt4-result.json'){
 verify();if(!/^[a-z0-9-]+\.json$/.test(resultName))throw Error('RESULT_NAME_INVALID');
 let input;try{const b=fs.readFileSync(privateFile);if(b.length>1048576)throw Error();input=JSON.parse(b.toString('utf8'));}catch{throw Error('PRIVATE_INPUT_INVALID');}
 const {gate}=require('./gate-attempt4.cjs'),adapter=require('../rc31-android-cookie-gate/android-adapter-attempt3.cjs'),{prepare}=require('./normal-replay-attempt4.cjs');
 return gate(adapter(prepare(input),r=>fs.writeFileSync(path.join(__dirname,resultName),JSON.stringify(r,null,2)+'\n')));
}
module.exports={execute,verify};if(require.main===module){if(!process.argv[2]){console.error('PRIVATE_INPUT_REQUIRED');process.exitCode=1;}else execute(path.resolve(process.argv[2]),process.argv[3]).then(r=>{console.log(JSON.stringify({completed:r.completed,failure:r.failure||null,cleanup:r.cleanup,sourceCommit:r.sourceCommit,originalByteScope:r.originalByteScope,q0CookieCoverage:r.q0CookieCoverage}));if(!r.completed)process.exitCode=1;}).catch(()=>{console.error('PREPARATION_FAILED');process.exitCode=1;});}
