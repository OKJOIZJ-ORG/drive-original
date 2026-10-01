'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function verify(){const m=JSON.parse(fs.readFileSync(path.join(__dirname,'preparation-freeze.json'),'utf8'));
 if(m.actualExecution!==false||m.sourceCommit!=='4a484e6f839d2e6c3eb83503acb08147362cb011'||m.version!=='1.22.0-rc.31')throw Error('PREPARATION_MANIFEST_INVALID');
 for(const r of m.files){if(!/^[A-Za-z0-9.-]+$/.test(r.path)||['.','..'].includes(r.path))throw Error('MANIFEST_PATH_INVALID');const b=fs.readFileSync(path.join(__dirname,r.path));if(b.length!==r.bytes||sha(b)!==r.sha256)throw Error('PREPARATION_DRIFT');}
 return{verified:true,files:m.files.length,actualExecution:false,sourceCommit:m.sourceCommit};}
module.exports={verify};if(require.main===module)console.log(JSON.stringify(verify()));
