'use strict';
// QA request condition only. Product, canonical verifier and bound source stay unchanged.
const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const guard=require('./delivery-guard.cjs'),nativeFetch=globalThis.fetch;
guard.assertSource();
const allowed=new Set(guard.files.filter(file=>/\.wasm$|\.tgz$|\.tar\.gz\.part\d+$/.test(file)));
const record={schema:'rc38-identity-head-condition/1',source:guard.SOURCE,version:guard.VERSION,
 producerSHA256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
 changedCondition:'Accept-Encoding: identity for exact public unchanged-asset HEADs only',
 canonicalVerifierChanged:false,productChanged:false,headTargets:[],startedAt:new Date().toISOString()};
const target=path.join(__dirname,'identity-head-condition.json');
fs.writeFileSync(target,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
globalThis.fetch=function(input,options){
 const url=new URL(String(input)),file=url.pathname.slice(1);
 if(options?.method==='HEAD'&&url.origin===new URL(guard.BASE).origin&&allowed.has(file)){
  const headers=new Headers(options.headers);headers.set('accept-encoding','identity');
  record.headTargets.push(file);fs.writeFileSync(target,JSON.stringify(record,null,2)+'\n');
  return nativeFetch(input,{...options,headers});
 }
 return nativeFetch(input,options);
};
