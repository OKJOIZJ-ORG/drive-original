'use strict';
const crypto=require('node:crypto');
const paths=Object.freeze(['/version.json','/sw.js','/media/revision-pin.js']);
const stackPaths=Object.freeze(['/app.js','/sw.js','/media/revision-pin.js']);
const functions=new Set(['checkForAppUpdate','setupServiceWorker','resumeStandaloneAuthorization','restartPendingMediaAfterServiceWorkerChange']);
function localPath(raw,origin,allowed=paths){try{const u=new URL(raw);return u.origin===origin&&allowed.includes(u.pathname)?u.pathname:null;}catch{return null;}}
function reduceRequest(event,origin,elapsedMs){const file=localPath(event?.request?.url,origin);if(!file)return null;const frames=[];let stack=event.initiator?.stack;for(let level=0;stack&&level<3;level++,stack=stack.parent){for(const f of (stack.callFrames||[]).slice(0,8)){const publicPath=localPath(f.url,origin,stackPaths);if(!publicPath||frames.length>=8)continue;frames.push({file:publicPath,functionName:functions.has(f.functionName)?f.functionName:f.functionName===''?'ANONYMOUS':'UNKNOWN',lineZeroBased:Number.isSafeInteger(f.lineNumber)&&f.lineNumber>=0&&f.lineNumber<=100000?f.lineNumber:null});}}
 return{elapsedMs:Number.isFinite(elapsedMs)?elapsedMs:null,cdpTimestampMs:Number.isFinite(event.timestamp)?event.timestamp*1000:null,file,initiatorType:['parser','script','preload','preflight','other'].includes(event.initiator?.type)?event.initiator.type:'UNKNOWN',frames};}
function reduceResponse(file,method,status,body,expected,elapsedMs){if(!paths.includes(file)||!['GET','HEAD'].includes(method))return null;const hash=crypto.createHash('sha256').update(body).digest('hex');return{elapsedMs:Number.isFinite(elapsedMs)?elapsedMs:null,file,method,status:[200,404,405].includes(status)?status:null,bodyBytes:method==='HEAD'?0:body.length,representationBytes:body.length,bodySha256:hash,representationMatched:hash===expected};}
module.exports={paths,reduceRequest,reduceResponse};
