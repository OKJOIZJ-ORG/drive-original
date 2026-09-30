'use strict';
// Only reconstructs already returned scrubbed tool rows; never replays the action.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const rows=[
{at:1790808906840,attachKind:'late-attach',document:1,fromDocumentStart:false,ms:121666,stage:'document-start',visible:true},
{at:1790808906842,document:1,ms:121668,stage:'worker-observed',worker:1,workerState:'activated'},
{accountPresent:true,activeMatchesController:true,activeStates:['activated'],at:1790808906843,authOnline:true,cacheCount:1,controller:true,controllerOrdinal:1,controllerScriptMatches:true,controllerState:'activated',document:1,installing:false,ms:121669,playerClosed:true,registrations:1,rootScope:true,shellVersions:['1.22.0-rc.28'],stage:'lifecycle-snapshot',version:'1.22.0-rc.28',visible:true,waiting:false},
{at:1790808975561,cacheParity:true,document:1,matched:40,mismatch:0,missing:0,ms:190387,sourceExpected:true,stage:'cache-parity',version:'1.22.0-rc.28'},
{at:1790809000260,document:1,ms:215086,stage:'trusted-force-refresh-click'},
{at:1790809001385,document:1,ms:216211,stage:'pagehide'},
{at:1790809039824,attachKind:'late-attach',document:2,fromDocumentStart:false,ms:38609,stage:'document-start',visible:true},
{at:1790809039826,document:2,ms:38611,stage:'worker-observed',worker:1,workerState:'activated'},
{accountPresent:true,activeMatchesController:true,activeStates:['activated'],at:1790809039827,authOnline:true,cacheCount:1,controller:true,controllerOrdinal:1,controllerScriptMatches:true,controllerState:'activated',document:2,installing:false,ms:38612,playerClosed:true,registrations:1,rootScope:true,shellVersions:['1.22.0-rc.28'],stage:'lifecycle-snapshot',version:'1.22.0-rc.28',visible:true,waiting:false},
{at:1790809039878,cacheParity:true,document:2,matched:40,mismatch:0,missing:0,ms:38663,sourceExpected:true,stage:'cache-parity',version:'1.22.0-rc.28'}];
const bool=['controller','rootScope','controllerScriptMatches','activeMatchesController','installing','waiting','accountPresent','authOnline','playerClosed','visible','fromDocumentStart','sourceExpected','cacheParity'];
const num=['document','at','ms','worker','controllerOrdinal','registrations','listenerCount','cacheCount','matched','missing','mismatch'];
const exact=rows.map(r=>{const x={stage:r.stage};for(const k of [...bool,...num,'workerState','controllerState','version','attachKind','resourceTag','shellVersions','activeStates'])if(k in r)x[k]=r[k];return x;});
const sha=crypto.createHash('sha256').update(JSON.stringify(exact)).digest('hex');assert.equal(sha,'2bbf5e484687632726a8ede4756e398807ded69bb964ba9ec251cd402cb95761');
const report={schema:'drive-original.actual-force28/1',source:'944f00607cf05e586b1c88e2876dd796ce114e82',version:'1.22.0-rc.28',trustedClicks:1,pagehideAt:1790809001385,clickedAt:1790809000260,qualifiedAt:1790809039878,qualifiedWithin45s:true,matched:40,missing:0,mismatch:0,controllerStable:true,ownerQualified:true,accountSame:true,writerSame:true,allProjectionPreserved:true,online:true,loaded:true,closed:true,lateAttachmentGaps:true,actualExecutingWorkerHashKnown:false,safeRows:exact,safeRowsSHA256:sha,dropped:0,cleanupAt:1790809079600,cleanup:{observerReleased:true,listenersAfter:0,ownBaselineRemoved:true,ownJournalKeyRemoved:true,globalRemoved:true},scope:'New actual same-account Chrome3 source28 caller after move; earlier27→28 normal update proof retained separately, original reopen is separate'};
fs.writeFileSync(path.join(__dirname,'actual-force28.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({saved:true,safeRows:exact.length,sha,forceQualified:true}));
