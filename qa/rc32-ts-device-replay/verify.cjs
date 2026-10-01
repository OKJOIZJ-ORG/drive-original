'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),gate=require('./binding-gate.cjs');
function verify(){
 gate.verifyBound();const files=fs.readdirSync(__dirname).filter(f=>/\.(?:cjs|js)$/.test(f));
 for(const f of files){const r=spawnSync(process.execPath,['--check',path.join(__dirname,f)],{windowsHide:true,encoding:'utf8',timeout:10000});if(r.error||r.status!==0)throw Error('SYNTAX_CHECK_FAILED');}
 const tests=files.filter(f=>f.endsWith('.test.cjs')).map(f=>path.join(__dirname,f));
 const r=spawnSync(process.execPath,['--test',...tests],{windowsHide:true,encoding:'utf8',timeout:30000});
 if(r.error||r.status!==0){process.stderr.write(r.stdout||'');throw Error('FOCUSED_CHECK_FAILED');}
 const count=Number(r.stdout.match(/(?:ℹ|#) tests (\d+)/)?.[1]);if(!Number.isSafeInteger(count)||count<30)throw Error('TEST_COUNT_UNCONFIRMED');
 return{schema:'drive-original.rc32-ts-replay-local-checks/1',passed:true,sourceCommit:gate.COMMIT,version:gate.VERSION,tests:count,failed:0,syntaxFiles:files.length,freezeVerified:true,actualDevice:false,privateInputRead:false,providerCalls:false,speedupClaimed:false};
}
module.exports={verify};
if(require.main===module){try{const r=verify();fs.writeFileSync(path.join(__dirname,'local-result.json'),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r,null,2));}catch(e){console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'VERIFY_FAILED');process.exitCode=1;}}
