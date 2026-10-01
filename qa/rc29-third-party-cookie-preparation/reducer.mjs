// Pure reduction only. No browser/protocol/network/cookie reads or writes.
export function reduceCookieExclusions(event,{crossSite=false,originalRouteRequest=false}={}){
 const reasons=new Set(['UserPreferences','ThirdPartyPhaseout']);
 const associated=Array.isArray(event?.associatedCookies)?event.associatedCookies:[];
 let thirdPartyBlocked=0,otherBlocked=0,included=0,exempted=0;
 const observed=new Set();
 for(const row of associated){const blocked=Array.isArray(row?.blockedReasons)?row.blockedReasons:[];const matched=blocked.filter(reason=>reasons.has(reason));if(matched.length){thirdPartyBlocked++;matched.forEach(reason=>observed.add(reason));}else if(blocked.length)otherBlocked++;else included++;if(row?.exemptionReason&&row.exemptionReason!=='None')exempted++;}
 return {eventObserved:event!==null&&typeof event==='object',potentiallyAssociated:associated.length,thirdPartyBlocked,otherBlocked,included,exempted,blockingReasons:[...observed].sort(),qualifyingNegative:crossSite===true&&originalRouteRequest===true&&thirdPartyBlocked>0,scope:'Only request-associated third-party exclusion; no cookie/header/value/URL/requestID exported. Missing events/cookies do not prove effective restriction.'};
}
