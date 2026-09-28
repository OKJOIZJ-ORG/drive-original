export const COMPARATOR_CODES = Object.freeze(['INVALID_PASS','ROOT_PROVENANCE_UNCONFIRMED','ACCOUNT_CHANGED','ROOT_CHANGED','PRIORITY_ANCHOR_MISSING','REPEAT_MISMATCH','CLASSIFIED_METADATA_CONFLICT','COUNT_INVARIANT_FAILED']);
const FLAGS = ['rootBeforeChanged','rootAfterChanged','accountBeforeChanged','accountAfterChanged','traversedFolderCountChanged','duplicateReferenceCountChanged','unresolvedShortcutTargetCountChanged','staleShortcutTargetMimeCountChanged'];
const COUNTS = ['itemsAdded','itemsRemoved','itemsChanged','shortcutTargetsAdded','shortcutTargetsRemoved','shortcutTargetsChanged'];
export function emptyComparisonDiagnostic(cause) {
  let code;try{code=cause?.code;}catch{}
  return {comparatorCode:COMPARATOR_CODES.includes(code)?code:'COMPARATOR_UNKNOWN',diagnosticAvailable:false,
    ...Object.fromEntries(FLAGS.map(key=>[key,false])),...Object.fromEntries(COUNTS.map(key=>[key,0]))};
}
// Even injected diagnostic results cannot add private values or unknown keys.
export function sanitizeComparisonDiagnostic(value,cause) {
  const result=emptyComparisonDiagnostic(cause);
  try {
    if(result.comparatorCode==='COMPARATOR_UNKNOWN'||value?.diagnosticAvailable!==true)return result;
    if(FLAGS.some(key=>typeof value[key]!=='boolean')||COUNTS.some(key=>!Number.isSafeInteger(value[key])||value[key]<0))return result;
    result.diagnosticAvailable=true;
    for(const key of [...FLAGS,...COUNTS])result[key]=value[key];
  }catch{}
  return result;
}
function difference(before,after) {
  let added=0,removed=0,changed=0;
  for(const [key,value] of before){if(!after.has(key))removed++;else if(after.get(key)!==value)changed++;}
  for(const key of after.keys())if(!before.has(key))added++;
  return {added,removed,changed};
}
function privateRows(rows,keyOf,rowOf) {
  if(!Array.isArray(rows))throw new Error('Invalid private input');
  const map=new Map();
  for(const row of rows){const key=keyOf(row);if(typeof key!=='string'||!key||map.has(key))throw new Error('Invalid private input');map.set(key,rowOf(row));}
  return map;
}
// Canonical normalizers are injected from the maintained root core's private
// lexical closure by the builder. No normalization copy or private view export.
export function diagnoseComparisonFailure(cause,firstPass,secondPass,{rootFence,stableItemRow}={}) {
  const output=emptyComparisonDiagnostic(cause);
  if(output.comparatorCode==='COMPARATOR_UNKNOWN')return output;
  try {
    if(typeof rootFence!=='function'||typeof stableItemRow!=='function'||!firstPass||!secondPass)throw new Error('Unavailable');
    output.rootBeforeChanged=rootFence(firstPass.rootBefore)!==rootFence(secondPass.rootBefore);
    output.rootAfterChanged=rootFence(firstPass.rootAfter)!==rootFence(secondPass.rootAfter);
    output.accountBeforeChanged=firstPass.accountBefore!==secondPass.accountBefore;
    output.accountAfterChanged=firstPass.accountAfter!==secondPass.accountAfter;
    for(const key of ['traversedFolderCount','duplicateReferenceCount','unresolvedShortcutTargetCount','staleShortcutTargetMimeCount'])output[`${key}Changed`]=firstPass[key]!==secondPass[key];
    const items=difference(privateRows(firstPass.items,row=>row.id,stableItemRow),privateRows(secondPass.items,row=>row.id,stableItemRow));
    const shortcuts=difference(privateRows(firstPass.shortcutTargets??[],row=>row[0],row=>stableItemRow(row[1])),privateRows(secondPass.shortcutTargets??[],row=>row[0],row=>stableItemRow(row[1])));
    output.itemsAdded=items.added;output.itemsRemoved=items.removed;output.itemsChanged=items.changed;
    output.shortcutTargetsAdded=shortcuts.added;output.shortcutTargetsRemoved=shortcuts.removed;output.shortcutTargetsChanged=shortcuts.changed;
    output.diagnosticAvailable=true;
    return sanitizeComparisonDiagnostic(output,cause);
  }catch{return emptyComparisonDiagnostic(cause);}
}
