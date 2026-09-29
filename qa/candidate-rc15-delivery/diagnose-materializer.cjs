'use strict';
// Record actual generated-output filesystem observations without weakening guards.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),site=path.join(root,'_site');
const observations=[];
const api={...fs,lstatSync(absolute,...args){
  const stat=fs.lstatSync(absolute,...args);
  if(absolute===site||absolute.startsWith(site+path.sep))observations.push({
    relative:path.relative(site,absolute).split(path.sep).join('/'),
    isFile:stat.isFile(),isDirectory:stat.isDirectory(),isSymbolicLink:stat.isSymbolicLink(),nlink:stat.nlink});
  return stat;
}};
const report={source:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  scope:'Generated candidate output filesystem only; original materializer guards are unchanged',
  observations,passed:false};
try{report.result=require('../../scripts/materialize-committed-pages.cjs').materializeCommittedPages({fsApi:api});report.passed=true;}
catch(error){report.error=error.message;process.exitCode=1;}
fs.writeFileSync(path.join(__dirname,'materializer-observations.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,error:report.error,observations:observations.length,last:observations.at(-1)}));
