'use strict';
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { SOURCE, VERSION } = require('./gate-attempt2.cjs');
const PRIVACY_SAFE_EXPRESSION = `({version:APP_VERSION,accountPresent:!!state.authAccountKey,existingValidToken:hasUsableToken(),playerClosed:state.selected===null&&el.playerSheet.hidden,authOnline:state.authStatus==='online',loaded:state.accountStateLoaded})`;
// Playwright string evaluation evaluates an expression; it does not invoke an
// arrow function string. This expression returns only finite public primitives.
const evaluateOriginalBaseline = page => page.evaluate(PRIVACY_SAFE_EXPRESSION);
const root = path.resolve(__dirname, '../..');
const origin = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const adbPath = path.join(path.dirname(root), 'maintenance/tools/scrcpy-v4.1/scrcpy-win64-v4.1/adb.exe');
function pkg(name) {
  const cache = path.join(process.env.LOCALAPPDATA, 'npm-cache/_npx');
  const found = fs.readdirSync(cache).map(d => path.join(cache,d,'node_modules',name)).find(p => fs.existsSync(path.join(p,'package.json')));
  if (!found) throw Error('PACKAGE_MISSING'); return found;
}
function textContent(r) { if (r.isError) throw Error('MCP_ERROR'); return r.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'); }
function ids(text) { return text.split(/\r?\n/).flatMap(l=>{const m=l.match(/^\s*(\d+): /);return m?[Number(m[1])]:[];}); }
module.exports = function adapter(normalReplay, record) {
  if (typeof normalReplay !== 'function') throw Error('ROOT_NORMAL_REPLAY_REQUIRED');
  let serial, port, client, browser, original, page, session, pageId, originalPin, treeId, context;
  let cookieError = null;
  const finite = (promise, ms=15000) => { let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('RUNTIME_COMMAND_DEADLINE')),ms);})]).finally(()=>clearTimeout(timer)); };
  const adb = args => { const r=spawnSync(adbPath,serial?['-s',serial,...args]:args,{encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:1024*1024}); if(r.error||r.status!==0)throw Error('ADB_FAILED');return r.stdout.trim(); };
  const evaluate = async (expression,timeoutMs=45000) => { const r=await finite(session.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true}),Math.max(1,Math.min(45000,timeoutMs)));if(r.exceptionDetails)throw Error('SAFE_EVALUATION_FAILED');return r.result.value; };
  const api = {
    now: Date.now, record,
    async bootstrap() {
      const devices=adb(['devices','-l']).split(/\r?\n/).filter(l=>/^\S+\s+device(?:\s|$)/.test(l));if(devices.length!==1)throw Error('DEVICE_COUNT');serial=devices[0].split(/\s+/)[0];
      port=Number(adb(['forward','tcp:0','localabstract:chrome_devtools_remote']));
      const sdk=pkg('@modelcontextprotocol/sdk'), mcp=pkg('chrome-devtools-mcp');
      const {Client}=await import(pathToFileURL(path.join(sdk,'dist/esm/client/index.js')).href);
      const {StdioClientTransport}=await import(pathToFileURL(path.join(sdk,'dist/esm/client/stdio.js')).href);
      const transport=new StdioClientTransport({command:process.execPath,args:[path.join(mcp,'build/src/bin/chrome-devtools-mcp.js'),`--browserUrl=http://127.0.0.1:${port}`,'--categoryExtensions=false','--no-usage-statistics','--no-performance-crux','--redactNetworkHeaders',`--workspace=${root}`],stderr:'pipe',env:{...process.env,CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS:'1'}});
      transport.stderr.on('data',()=>{});client=new Client({name:'drive-original-android-cookie-gate',version:'1.0.0'},{capabilities:{}});await client.connect(transport);
    },
    async toolCapabilities() { const list=(await client.listTools()).tools;const names=new Set(list.map(t=>t.name));return {newPage:names.has('new_page'),closePage:names.has('close_page'),listPages:names.has('list_pages'),genericCDPCommand:names.has('send_cdp_command'),runtimeToolInventoryChecked:true}; },
    async pinOriginal() {
      await client.callTool({name:'list_pages',arguments:{}}); // Official MCP bootstrap precedes native CDP.
      const {chromium}=require('../node_modules/playwright');browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      const matches=browser.contexts().flatMap(c=>c.pages()).filter(p=>{try{return new URL(p.url()).origin===origin;}catch{return false;}});
      if(matches.length!==1)throw Error('ORIGINAL_TARGET_COUNT');original=matches[0];context=original.context();
      originalPin=await original.evaluate(()=>({account:state.accountId,key:state.authAccountKey}));
      return finite(evaluateOriginalBaseline(original));
    },
    async createOwnedPage() {
      const before=new Set(ids(textContent(await client.callTool({name:'list_pages',arguments:{}}))));
      // No isolatedContext: the official API must retain the existing context naturally.
      await client.callTool({name:'new_page',arguments:{url:origin,background:false,timeout:30000}});
      const after=ids(textContent(await client.callTool({name:'list_pages',arguments:{}}))).filter(id=>!before.has(id));
      const added=context.pages().filter(p=>p!==original&&(()=>{try{return new URL(p.url()).origin===origin;}catch{return false;}})());
      // Retain each uniquely identified owner before a later identity check can fail.
      if(after.length===1)pageId=after[0];if(added.length===1)page=added[0];
      if(after.length!==1||added.length!==1)throw Error('OWNED_TARGET_AMBIGUOUS');pageId=after[0];page=added[0];
    },
    async attachOwnedPage() { session=await context.newCDPSession(page);await finite(session.send('Emulation.setFocusEmulationEnabled',{enabled:false})); },
    async ownerReceipt() {
      const target=(await session.send('Target.getTargetInfo')).targetInfo;
      const tree=(await session.send('Page.getFrameTree')).frameTree;if(treeId&&treeId!==tree.frame.id)throw Error('FRAME_OWNER_CHANGED');treeId=tree.frame.id;
      return {pageType:target.type==='page',taskCreated:page!==original,exactTarget:!!target.targetId,sameBrowserContext:page.context()===original.context(),mainFrame:!tree.frame.parentId,noIndependentFrames:!(tree.childFrames?.length),independentServiceWorkerOverrideClaimed:false};
    },
    async send(method,params) { try{return await finite(session.send(method,params));}catch(e){if(method==='Network.setCookieControls')cookieError=e;throw e;} },
    isUnsupportedCookieCommand: e=>e===cookieError && /not found|wasn't found|unknown method|not supported|invalid parameters/i.test(e.message),
    async reloadOwned() { await page.reload({waitUntil:'domcontentloaded',timeout:30000});const tree=(await session.send('Page.getFrameTree')).frameTree;if(tree.frame.id!==treeId||tree.childFrames?.length)throw Error('RELOAD_FRAME_OWNER'); },
    async sourceAndAccountProof(end) {
      let ready=false;while(Date.now()<end-45000){ready=await evaluate(`Boolean(APP_VERSION===${JSON.stringify(VERSION)}&&state.accountStateLoaded&&state.authStatus==='online'&&hasUsableToken()&&state.selected===null&&q1RetirementResult?.settled===true)`);if(ready)break;await new Promise(r=>setTimeout(r,500));}if(!ready)throw Error('EXISTING_LOGIN_OR_SOURCE_NOT_READY');
      const expression=fs.readFileSync(path.join(root,'qa/rc31-resume-20261001/source-proof.expression.js'),'utf8');
      if(require('node:crypto').createHash('sha256').update(expression).digest('hex')!=='6257edcc580785a3e265aec717ac06e7504ef86a408ce9c964f08719b5fc1725')throw Error('SOURCE_PROOF_DRIFT');
      const proof=await evaluate(expression);
      const sameAccount=await evaluate(`state.accountId===${JSON.stringify(originalPin.account)}&&state.authAccountKey===${JSON.stringify(originalPin.key)}`);
      const safety=await evaluate(`({existingValidToken:hasUsableToken(),noGoogleIframe:![...document.querySelectorAll('iframe')].some(f=>{try{return /(^|\\.)(google\\.com|googleapis\\.com|googleusercontent\\.com)$/.test(new URL(f.src,location.href).hostname)}catch{return false}})})`);
      return {sourceCommit:proof.source,version:proof.version,publicMatched:proof.network.filter(r=>r.matched).length,cacheMatched:proof.matchedCache,rootAliasMatched:proof.shellRootAliasMatched,controllerActivated:proof.controllerActivated,sameAccount,...safety,executingWorkerScriptHashKnown:false};
    },
    async normalReplay(end) {
      // Root callback owns private target discovery and normal native inputs. It receives
      // private page objects but must return only the gate's finite reduced receipt fields.
      const physicalScreen=adb(['shell','wm','size']);
      const result=await normalReplay({page,evaluate,adb,end,physicalScreen,originalAccountMatches:()=>evaluate(`state.accountId===${JSON.stringify(originalPin.account)}&&state.authAccountKey===${JSON.stringify(originalPin.key)}`),ownerReceipt:api.ownerReceipt});
      const tree=(await session.send('Page.getFrameTree')).frameTree;
      if(tree.frame.id!==treeId||tree.childFrames?.length)throw Error('REPLAY_FRAME_OWNER');return result;
    },
    async closeOwnedPlayer() {
      if(!page||page.isClosed())return true;
      const open=await page.evaluate(()=>typeof state!=='undefined'&&state.selected!==null);
      if(open){ await page.bringToFront();adb(['shell','input','keyevent','KEYCODE_BACK']); }
      const end=Date.now()+10000;while(Date.now()<end){const settled=await page.evaluate(()=>typeof state==='undefined'||(state.selected===null&&el.playerSheet.hidden&&!q0Playback&&!q1Playback&&q1RetirementResult?.settled===true));if(settled)return true;await new Promise(r=>setTimeout(r,300));}return false;
    },
    async detachOwnedSession() { if(session){await finite(session.detach());session=null;} },
    async closeOwnedPage() { if(pageId===undefined)throw Error('OWNED_PAGE_ID_UNKNOWN');const r=await client.callTool({name:'close_page',arguments:{pageId}});textContent(r);if(page&&!page.isClosed())throw Error('OWNED_PAGE_NOT_CLOSED'); },
    async originalIntact() { if(!original||original.isClosed())return false;return original.evaluate(({account,key})=>state.accountId===account&&state.authAccountKey===key&&state.selected===null&&el.playerSheet.hidden,originalPin); },
    async disconnect() {
      let failed=false;
      if(session)try{await finite(session.detach());session=null;}catch{failed=true;}
      if(client)try{await finite(client.close());client=null;}catch{failed=true;}
      if(browser)try{await finite(browser.close());browser=null;}catch{failed=true;}
      if(port&&serial)try{adb(['forward','--remove',`tcp:${port}`]);port=null;}catch{failed=true;}
      if(failed)throw Error('OWNED_CONNECTION_CLEANUP_UNCONFIRMED');
    },
  };
  return api;
};
module.exports.evaluateOriginalBaseline=evaluateOriginalBaseline;
module.exports.PRIVACY_SAFE_EXPRESSION=PRIVACY_SAFE_EXPRESSION;
