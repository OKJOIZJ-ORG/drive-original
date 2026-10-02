'use strict';
// Only a closed, retired, buffer-empty native element with a stale currentSrc
// may get an ordinary preparation reload. The subsequent original cold gate
// still requires a pristine native element and a second fresh cache-bypassed document.
function canPrepareFresh(s){
 const i=s?.idle,n=s?.native;
 return !!i&&!!n&&['closed','ownersEmpty','retirementSettled','appBuffersEmpty','selectedEmpty','foreground','online'].every(k=>i[k]===true)&&i.nativeEmpty===false&&s.root===true&&s.queryEmpty===true&&s.accountIdle===true&&s.foreignHelpers===false&&n.currentSrc===true&&n.hasSrc===false&&n.srcObject===false&&n.sourceCount===0&&n.readyState===0&&n.networkState===0&&n.buffered===0;
}
module.exports={canPrepareFresh};
