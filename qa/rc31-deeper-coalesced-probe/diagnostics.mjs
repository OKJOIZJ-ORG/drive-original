// Fixed enums only. Never serialize error.message, arbitrary codes, raw stack,
// filenames, URLs or provider response objects from authenticated execution.
const classes=new Set(['Error','TypeError','RangeError','SyntaxError','ReferenceError','DOMException','RepresentativeSelectionError','BoundedProbeError','RootInventoryError']);
const codes=new Set(['INVALID_ITEM','INVALID_INVENTORY','INVENTORY_INCOMPLETE','OBJECT_METADATA_CONFLICT','PRIORITY_FENCE_MISSING','PRIORITY_FENCE_MISMATCH','UNCOVERED_CATEGORY','SELECTION_NOT_MINIMAL','SELECTION_FAILED','INVALID_IDENTITY','INVALID_RANGE','RUNTIME_REJECTED','OWNER_CHANGED','CANCELLED','METADATA_LIMIT','METADATA_FAILED','INVENTORY_FAILED','CATALOG_DRIFT','RUN_TIMEOUT','CLEANUP_FAILED','CLEANUP_TIMEOUT','PROBE_FAILED','HEADER_TIMEOUT','BODY_TIMEOUT','PREFLIGHT_FAILED','POSTFLIGHT_FAILED','IDENTITY_MISMATCH']);
const phases=new Set(['not-started','inventory-before','selection','selection-select','selection-plan','selection-references','selection-witness','selection-denominators','selection-owner-check','reserve','probe','inventory-after','done']);
const functions=new Set(['selectRiskRepresentatives','buildObjects','addObject','normalizedPrivateReference','privateStableRow','planDeepCohorts','safeReferences','normalizeProbeIdentity','exactIntegerText','requiredString','execute','readInventory','current','inspect','witness','clone','summarizeProbeDenominators','summarizeInventoryDenominators','fail']);
export function sanitizeFailureDiagnostic(error,phase){
 const result={schema:'drive-original.qa-fixed-failure-diagnostic/1',phase:phases.has(phase)?phase:'unclassified',exceptionClass:'unclassified',code:'unclassified',frames:[],rawMessageExported:false,rawStackExported:false,privateDataExported:false};
 try{
  if(classes.has(error?.name))result.exceptionClass=error.name;
  if(codes.has(error?.code))result.code=error.code;
  if(typeof error?.stack==='string')for(const frame of error.stack.split('\n').slice(1)){
   const name=/^\s*at (?:Object\.)?([A-Za-z_$][\w$]*)\s*(?:\(|$)/.exec(frame)?.[1],position=/(?::|\s)(\d+):(\d+)\)?\s*$/.exec(frame);
   if(functions.has(name)&&position&&Number(position[1])>0&&Number(position[1])<=100000)result.frames.push({function:name,line:Number(position[1])});
   if(result.frames.length===4)break;
  }
 }catch{}return result;
}
