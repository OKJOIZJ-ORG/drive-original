'use strict';
const fs=require('node:fs'),path=require('node:path');
const {gate}=require('./gate-attempt2.cjs'),makeAdapter=require('./android-adapter-attempt2.cjs'),{prepare}=require('./normal-replay.cjs');
async function execute(privateFile,resultName='actual-android-cookie-gate-attempt2-result.json') {
 if(!/^[a-z0-9-]+\.json$/.test(resultName))throw Error('RESULT_NAME_INVALID');
 // This private read is reached only by the root's explicit actual execution.
 let input;try{const b=fs.readFileSync(privateFile);if(b.length>1048576)throw Error();input=JSON.parse(b.toString('utf8'));}catch{throw Error('PRIVATE_INPUT_INVALID');}
 const replay=prepare(input),resultFile=path.join(__dirname,resultName);
 return gate(makeAdapter(replay,r=>fs.writeFileSync(resultFile,JSON.stringify(r,null,2)+'\n')));
}
module.exports={execute};
if(require.main===module){if(!process.argv[2]){console.error('PRIVATE_INPUT_REQUIRED');process.exitCode=1;}
 else execute(path.resolve(process.argv[2]),process.argv[3]).then(r=>{console.log(JSON.stringify({completed:r.completed,failure:r.failure||null,failureStage:r.failureStage||null,safeErrorClass:r.safeErrorClass||null,cleanup:r.cleanup,sourceCommit:r.sourceCommit,version:r.version}));if(!r.completed)process.exitCode=1;}).catch(()=>{console.error('PREPARATION_FAILED');process.exitCode=1;});}
