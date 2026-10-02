'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const here=__dirname,root=path.resolve(here,'../..'),file=path.join(here,'source-binding.json'),manifestFile=path.join(here,'preparation.json');
const VERSION='1.22.0-rc.38',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function verifyPreparation(){const bytes=fs.readFileSync(manifestFile),manifest=JSON.parse(bytes);if(manifest.version!==VERSION||manifest.sourceCommit!=='UNKNOWN'||manifest.actualExecution!==false)throw Error('RC38_PREPARATION_REQUIRED');
 for(const row of manifest.producers){const absolute=path.resolve(root,row.file);if(!absolute.startsWith(root+path.sep)||!absolute.startsWith(path.join(root,'qa')+path.sep)||sha(fs.readFileSync(absolute))!==row.sha256)throw Error('RC38_PREPARATION_PRODUCER_CHANGED');}return sha(bytes);}
function validate(v){if(v?.schema!=='rc38-root-runtime-source-binding/1'||v.version!==VERSION||!/^[a-f0-9]{40}$/.test(v.sourceCommit||'')||v.preparationSHA256!==verifyPreparation())throw Error('RC38_ROOT_SOURCE_BINDING_INVALID');
 const type=cp.execFileSync('git',['cat-file','-t',v.sourceCommit],{cwd:root,encoding:'utf8',windowsHide:true}).trim();if(type!=='commit')throw Error('RC38_RUNTIME_COMMIT_REQUIRED');
 const version=JSON.parse(cp.execFileSync('git',['show',v.sourceCommit+':version.json'],{cwd:root,encoding:'utf8',windowsHide:true}));if(version.version!==VERSION)throw Error('RC38_BOUND_VERSION_MISMATCH');return Object.freeze(v);}
function requireBinding(){if(!fs.existsSync(file))throw Error('RC38_ROOT_SOURCE_BINDING_REQUIRED');return validate(JSON.parse(fs.readFileSync(file,'utf8')));}
function optionalSource(){return fs.existsSync(file)?requireBinding().sourceCommit:'UNKNOWN';}
module.exports={requireBinding,optionalSource,validate,verifyPreparation,VERSION};
if(require.main===module){if(process.argv.length!==5||process.argv[2]!=='--bind'||process.argv[4]!=='--root-authorized')throw Error('RC38_ROOT_BIND_ARGUMENTS_REQUIRED');
 const record={schema:'rc38-root-runtime-source-binding/1',version:VERSION,sourceCommit:process.argv[3],preparationSHA256:verifyPreparation()};validate(record);fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({bound:true,sourceCommit:record.sourceCommit,version:VERSION}));}
