'use strict';
function parse(raw){
 const clean=raw.replace(/\r?\n\x1b\[\d+;\d+H./g,'').replace(/\x1b\][^\x07]*(?:\x07)/g,'').replace(/\x1b\[[0-9;?]*[A-Za-z]/g,'').trim();
 const rows=clean.split(/\r?\n/).flatMap(l=>{try{return[JSON.parse(l)];}catch{return[];}});
 const hasResult=x=>Object.prototype.hasOwnProperty.call(x,'result');
 const row=rows.filter(x=>hasResult(x)||x.failed||x.completed||x.resultSavedPrivately).at(-1);
 if(!row||row.failed)throw Error('ROOT_SAFE_RESULT_PARSE_OR_REMOTE_FAILURE');
 return hasResult(row)?row.result:{completed:row.completed===true,resultSavedPrivately:row.resultSavedPrivately===true};
}
module.exports={parse};
