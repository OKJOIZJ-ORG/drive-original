'use strict';
// Reduce the private official snapshot to fixed QA/control handles, never names.
const fs=require('node:fs'),path=require('node:path');
function decode(text){
 const result={};for(const line of text.split(/\r?\n/)){
  const m=line.match(/uid=([\w.]+)\s+(\w+)\s+"([^"]*)"/);if(!m)continue;const [,uid,role,label]=m;
  if(role==='searchbox'){if(result.search)throw Error('PC_SEARCH_AMBIGUOUS');result.search=uid;continue;}
  if(role!=='button')continue;
  for(const [key,match] of Object.entries({seek50:label==='RC32 QA seek50',seek90:label==='RC32 QA seek90',control:/^(?:재생|일시\s?정지)$/.test(label)||label.startsWith('재생/일시정지 ('),up:label==='상위 폴더로 이동'})){
   if(match){if(result[key])throw Error('PC_CONTROL_AMBIGUOUS');result[key]=uid;}
  }
 }
 return result;
}
if(require.main===module){const p=path.join(__dirname,'../rc32-prefix-recovery-preparation/pc-current-snapshot-private.txt'),r=JSON.parse(fs.readFileSync(p));console.log(JSON.stringify(decode(r.content.filter(x=>x.type==='text').map(x=>x.text).join('\n'))));}
module.exports={decode};
