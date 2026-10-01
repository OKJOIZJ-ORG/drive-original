'use strict';
const {VERSION}=require('./gate.cjs');
const DOM_RECEIPT_EXPRESSION=`(()=>{const frames=[...document.querySelectorAll('iframe')],f=el.drivePreview,src=f?.getAttribute('src');return{versionExpected:APP_VERSION===${JSON.stringify(VERSION)},domFrameCount:frames.length,knownPreviewOnly:frames.length===1&&frames[0]===f&&f.id==='drivePreview',previewHidden:f?.hidden===true,previewSrcAbsent:src===null||src==='',previewSrcAboutBlank:src==='about:blank',previewSessionAbsent:!f?.dataset?.mediaSession,previewInactive:!String(state.mediaAttempt||'').startsWith('drive-preview')}})()`;
function classifyFrameUrl(value,origin) {
 if(value==='about:blank')return'aboutBlank';
 if(typeof value!=='string'||!value)return'unknown';
 try{const u=new URL(value);if(u.origin===origin)return'sameOrigin';if(!['http:','https:'].includes(u.protocol))return'unknown';return /(^|\.)(google\.com|googleapis\.com|googleusercontent\.com|gstatic\.com)$/.test(u.hostname)?'crossGoogle':'crossOther';}catch{return'unknown';}
}
function frameReceipt(tree,dom,origin) {
 const counts={total:0,aboutBlank:0,sameOrigin:0,crossGoogle:0,crossOther:0,unknown:0,maxDepth:0};
 let bounded=true;const walk=(children,depth)=>{for(const child of children||[]){if(counts.total>=64||depth>8){bounded=false;return;}counts.total++;counts.maxDepth=Math.max(counts.maxDepth,depth);counts[classifyFrameUrl(child.frame?.url,origin)]++;walk(child.childFrames,depth+1);}};walk(tree?.childFrames,1);
 const d=Object.fromEntries(['versionExpected','knownPreviewOnly','previewHidden','previewSrcAbsent','previewSrcAboutBlank','previewSessionAbsent','previewInactive'].map(k=>[k,dom?.[k]===true]));
 const domFrameCount=Number.isSafeInteger(dom?.domFrameCount)&&dom.domFrameCount>=0?dom.domFrameCount:null;
 const noFrames=counts.total===0&&domFrameCount===0;
 // Fixed31 index declares one src-less hidden iframe; resetDrivePreview only sets
 // about:blank. A same-origin nonblank document is classified but NOT admitted:
 // no such URL is justified by this known dormant-source contract.
 const onlyKnownDormantPreview=bounded&&counts.total===1&&counts.aboutBlank===1&&counts.maxDepth===1&&domFrameCount===1&&d.versionExpected&&d.knownPreviewOnly&&d.previewHidden&&(d.previewSrcAbsent||d.previewSrcAboutBlank)&&d.previewSessionAbsent&&d.previewInactive;
 return{childFrameCounts:counts,domFrameCount,...d,enumerationBounded:bounded,noChildFrames:noFrames,onlyKnownDormantPreview,frameScopeAdmitted:bounded&&(noFrames||onlyKnownDormantPreview),sameOriginNonblankAdmitted:false,independentWorkerOverrideClaimed:false};
}
module.exports={DOM_RECEIPT_EXPRESSION,classifyFrameUrl,frameReceipt};
