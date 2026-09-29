const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const args=process.argv.slice(2);
if(args.length>1||(args.length===1&&args[0]!=='--preflight'))throw Error('Q3_BUILD_ARGUMENT_INVALID');
const log=fs.openSync(path.join(__dirname,args.length?'build-preflight.log':'build.log'),'w');
const p=spawn('C:/Program Files/Git/bin/bash.exe',[path.join(__dirname,'build.sh'),...args],{cwd:path.resolve(__dirname,'../..'),stdio:['ignore',log,log],windowsHide:true});
let logClosed=false;
const closeLog=()=>{if(!logClosed){logClosed=true;fs.closeSync(log)}};
p.once('error',e=>{closeLog();console.error(e.message);process.exitCode=1});
p.once('exit',(code,signal)=>{closeLog();console.log('Q3 build exit',code,'signal',signal);process.exitCode=code===0&&!signal?0:1});
