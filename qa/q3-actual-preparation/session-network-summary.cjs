'use strict';
// Missing/evicted browser events supply no negative scope or request evidence.
function summarizeSessionNetwork({requests,responses,requestedScopes,truncated}) {
 const expected=['openid','https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/drive.appdata'].sort();
 const observed=[...new Set(requestedScopes)].sort();
 return {requests,responses,networkTruncated:truncated,
  requestedScopesObserved:observed.length>0,
  requestedScopeSetMatchesExistingFullCapabilities:observed.length?JSON.stringify(observed)===JSON.stringify(expected):'UNKNOWN',
  globalDisconnectObserved:requests['/api/account/disconnect']>0?true:truncated?'UNKNOWN':false,
  completeness:truncated?'TRUNCATED':'COMPLETE_OBSERVED_WINDOW',rawExported:false};
}
module.exports={summarizeSessionNetwork};
