'use strict';
const fs=require('node:fs'),path=require('node:path'),guard=require('./delivery-guard.cjs');
const scope=guard.assertSource();
const parent=path.dirname(guard.site);
if(fs.realpathSync(parent)!==parent||!fs.lstatSync(parent).isDirectory())throw Error('RELEASE_DIRECTORY_REQUIRED');
const blobs=new Map(guard.files.map(file=>[file,guard.blob(file)]));blobs.set('.nojekyll',Buffer.alloc(0));
// A new disposable output only. Never rebuild _site or overwrite retained assets.
if(!fs.existsSync(guard.site)){
 fs.mkdirSync(guard.site);
 for(const [file,bytes]of blobs){const absolute=path.join(guard.site,file);fs.mkdirSync(path.dirname(absolute),{recursive:true});fs.writeFileSync(absolute,bytes,{flag:'wx'});}
}
const assets=guard.verifySite();guard.assertSource();
const record={...scope,passed:true,materializedPath:guard.site,assets,all64EqualFixedGit:true,
 sourceUnchanged:true,oldSiteUntouched:true,actualDeployment:false,producerSha256:guard.sha(fs.readFileSync(__filename))};
fs.writeFileSync(path.join(__dirname,'materialization.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({passed:true,source:guard.SOURCE,assets:assets.length,materializedPath:guard.site}));
