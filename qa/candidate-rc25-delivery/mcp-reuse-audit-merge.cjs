'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm');
const here=__dirname,read=n=>fs.readFileSync(path.join(here,n)),load=n=>JSON.parse(read(n)),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const unwrap=n=>{const v=load(n);assert(!v.isError,n);const text=v.content.filter(x=>x.type==='text').map(x=>x.text).join('\n'),match=text.match(/```json\s*([\s\S]*?)\s*```/);assert(match,n);return JSON.parse(match[1]);};
const http=load('mcp-reuse-audit-http.json'),page=load('mcp-reuse-audit-page-result.json'),offline=unwrap('mcp-reuse-audit-offline-v4-discriminator.json'),online=unwrap('mcp-reuse-audit-online-control.json'),cleanup=unwrap('mcp-reuse-audit-cleanup-result.json');
const source='7ba8e654fa38def8c8e00efcbf1600a4c8730c53',version='1.22.0-rc.25';
assert(http.passed&&http.source===source&&page.source===source&&http.version===version&&page.version===version);
assert.equal(http.producerSha256,hash(read('mcp-reuse-audit-http.cjs')));assert.equal(page.freshContextProved,false);
assert.equal(http.assets.length,52);assert(http.assets.every(x=>x.gitEqual));assert.equal(http.privateRoutes.length,6);assert(http.privateRoutes.every(x=>x.status===404));
assert.equal(page.cached.length,40);assert(page.cached.every(x=>x.gitEqual&&x.sha256===http.assets.find(a=>a.file===x.file)?.sha256));
assert.equal(page.uncachedSourceDownloads.length,8);assert(page.uncachedSourceDownloads.every(x=>x.cached===false));
assert(page.cold.controlled&&page.cold.accountPresent===false&&page.cold.candidate===true&&page.cold.writes===false&&page.pageErrors===0&&page.firstNavigationMs<=45000);
assert(offline.version===version&&offline.controlled&&offline.candidate===true&&offline.writes===false&&offline.accountPresent===false&&offline.pageErrors.length===0);
assert(offline.probe.completed===false&&offline.probe.status===null&&offline.probe.errorName==='TypeError');
assert(online.path==='/.nojekyll?mcp-network-proof=rc25-postreload'&&online.online===true&&online.completed===true&&online.status===200&&online.bytes===0&&online.accountPresent===false);
assert(cleanup.online===true&&cleanup.temporaryGlobalsRemoved===true&&cleanup.cachesPurged===false&&cleanup.cookiesTouched===false);
assert(load('mcp-reuse-audit-offline-v1-tool-failure.json').isError===true&&load('mcp-reuse-audit-offline-v3-tool-failure.json').isError===true);
vm.runInNewContext('('+read('mcp-reuse-audit-offline-network.function.js').toString()+')',{}, {timeout:1000});
const evidenceFiles=['mcp-reuse-audit-http.cjs','mcp-reuse-audit-http.json','mcp-reuse-audit-binding.json','mcp-reuse-audit-page.function.js','mcp-reuse-audit-page-result.json','mcp-reuse-audit-offline.function.js','mcp-reuse-audit-offline-network.function.js','mcp-reuse-audit-offline-v1-tool-failure.json','mcp-reuse-audit-offline-v2-pre-reload-probe.json','mcp-reuse-audit-offline-v2-post-reload-read.json','mcp-reuse-audit-offline-v3-tool-failure.json','mcp-reuse-audit-offline-v4-discriminator.json','mcp-reuse-audit-online-control.json','mcp-reuse-audit-cleanup-result.json','audit-memory-guard.json'];
const result={source,version,base:http.base,passed:true,assets:http.assets,privateRoutes:http.privateRoutes,cold:page.cold,cached:page.cached,uncachedSourceDownloads:page.uncachedSourceDownloads,
 offline:{version,controlled:true,networkBlockedReload:true,networkProof:offline.probe,onlineControl:online,
   navigatorOnlineBeforeProbe:offline.onlineBeforeProbe,navigatorOnlineAfterProbe:offline.onlineAfterProbe,navigatorOnlineReliableForEmulatedReload:false},
 pageErrors:page.pageErrors+offline.pageErrors.length,firstNavigationMs:page.firstNavigationMs,cleanup,freshContextProved:false,
 preNavigationStorageInspectionExecuted:false,preNavigationStorageInspectionFailure:'MCP_FILEPATH_POLICY_REJECTED_BEFORE_SCRIPT_EXECUTION',
 evidenceFiles:evidenceFiles.map(file=>({path:'qa/candidate-rc25-delivery/'+file,sha256:hash(read(file))})),
 producerSha256:hash(fs.readFileSync(__filename)),auditProducer:'qa/candidate-rc25-delivery/mcp-reuse-audit-merge.cjs',
 derivativeOfflineFunctionExecuted:false,derivativeOfflineFunctionScope:'Prepared from observed root v4 discriminator; historical actual tool output preserved separately',
 originalFreshChromeAuditBlocked:true,originalMCPProfileLockPreserved:true,
 limitations:['Existing MCP-managed anonymous context; about:blank never proved a fresh context.','Pre-navigation storage inspection did not execute because tool filePath policy rejected it.','navigator.onLine remained true after network-blocked reload; uncached same-path failed probe and restored-online200 are the discriminator.','Preserved v1/v3 offline producer failures are not retrospectively promoted.','Public shell/cache proof only; no personal-account/media/physical-device/production acceptance.'],
 scope:'Public fixed-source HTTP and existing MCP-managed anonymous shell/cache/network-blocked reload; no fresh context or actual account/media/device proof',recordedAt:new Date().toISOString()};
const dest=path.join(here,'results.json');assert(!fs.existsSync(dest),'Preserve any existing result; never overwrite');fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:true,source,assets:52,cached:40,uncached:8,private404:6,pageErrors:0,networkBlockedReload:true,onlineRestored:true,freshContextProved:false}));
