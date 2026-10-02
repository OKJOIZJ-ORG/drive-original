'use strict';
// Read-only alternate native tool admission; never launches/reloads a page or uploads.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const output = path.join(__dirname, 'native-normal-profile-probe-v2-result.json');
const origin = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
function pkg(name) {
  const root = path.join(process.env.LOCALAPPDATA, 'npm-cache/_npx');
  const found = fs.readdirSync(root).map(d => path.join(root, d, 'node_modules', name))
    .find(p => fs.existsSync(path.join(p, 'package.json')));
  if (!found) throw Error('OFFICIAL_PACKAGE_MISSING');
  return found;
}
function safeCode(error) {
  return /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'NATIVE_CONNECTION_OR_PERMISSION_FAILED';
}
function texts(value) { return value.content.filter(c => c.type === 'text').map(c => c.text).join('\n'); }
function candidatePages(text) {
  return text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*(\d+): (.*)$/);
    if (!match) return [];
    const url = match[2].match(/^(https?:\/\/\S+)/)?.[1]
      ?? match[2].match(/\((https?:\/\/[^\s]+)\)(?: \[selected\])?(?: isolatedContext=.*)?$/)?.[1];
    if (!url) return [];
    try { return new URL(url).origin === origin ? [Number(match[1])] : []; } catch { return []; }
  });
}
function unpack(value) {
  if (value.isError) throw Error('NATIVE_EVALUATION_FAILED');
  const match = texts(value).match(/```json\s*([\s\S]*?)```/);
  if (!match) throw Error('SAFE_JSON_EXPECTED');
  return JSON.parse(match[1]);
}
async function bounded(promise, ms, code) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(code)), ms); })]); }
  finally { clearTimeout(timer); }
}
async function main() {
  if (fs.existsSync(output)) throw Error('RESULT_ALREADY_EXISTS');
  const started = Date.now();
  let client, transport, pid;
  const report = {
    schema: 'drive-original.rc37-native-profile-probe/1',
    producerSHA256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    startedAt: new Date(started).toISOString(),
    sourceCommit: '051dc3456f5000b958a18593848769b3687991e5',
    version: '1.22.0-rc.37',
    scope: 'read-only normal Chrome native DevTools admission',
    connectDeadlineMs: 12000, rpcDeadlineMs: 25000, cleanupDeadlineMs: 5000,
    providerRequests: 0, uploadedFiles: 0, profileSettingsChanged: false,
    pagesReloaded: 0, privateIdentifiersExported: false, completed: false,
  };
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  try {
    const sdk = pkg('@modelcontextprotocol/sdk'), mcp = pkg('chrome-devtools-mcp');
    report.officialMcpVersion = JSON.parse(fs.readFileSync(path.join(mcp, 'package.json'), 'utf8')).version;
    const { Client } = await import(pathToFileURL(path.join(sdk, 'dist/esm/client/index.js')).href);
    const { StdioClientTransport } = await import(pathToFileURL(path.join(sdk, 'dist/esm/client/stdio.js')).href);
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(mcp, 'build/src/bin/chrome-devtools-mcp.js'), '--autoConnect', '--channel=stable',
        '--categoryExtensions=false', '--no-usage-statistics', '--no-performance-crux', '--redactNetworkHeaders'],
      stderr: 'pipe', env: { ...process.env, CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1' },
    });
    transport.stderr.on('data', () => {});
    client = new Client({ name: 'drive-original-rc37-read-only-native-probe', version: '1.0.0' }, { capabilities: {} });
    report.stage = 'protocol-connect'; save();
    await bounded(client.connect(transport), report.connectDeadlineMs, 'PROTOCOL_CONNECT_DEADLINE');
    pid = transport.pid;
    const call = (name, args) => client.callTool({ name, arguments: args }, undefined, { timeout: report.rpcDeadlineMs, signal: AbortSignal.timeout(report.rpcDeadlineMs) });
    report.stage = 'normal-profile-list-or-runtime-permission'; save();
    const listing = await call('list_pages', {});
    if (listing.isError) throw Error('NORMAL_PROFILE_LIST_FAILED');
    const text = texts(listing), candidates = candidatePages(text);
    report.candidateTabs = candidates.length;
    report.containsExpectedOrigin = text.includes(origin);
    report.numberedPageRows = text.split(/\r?\n/).filter(line => /^\s*\d+: /.test(line)).length;
    save();
    if (candidates.length !== 1) throw Error('EXACT_NORMAL_CANDIDATE_TAB_REQUIRED');
    report.stage = 'safe-current-tab-admission'; save();
    report.admission = unpack(await call('evaluate_script', {
      pageId: candidates[0], waitForStableDom: false,
      function: `()=>({sameOrigin:location.origin===${JSON.stringify(origin)},version:APP_VERSION,loaded:state.accountStateLoaded===true,online:state.authStatus==='online',visible:document.visibilityState==='visible',usable:hasUsableToken(),generalWritesFalse:DRIVE_MUTATIONS_ENABLED===false,controllerActivated:navigator.serviceWorker.controller?.state==='activated',closed:el.playerSheet.hidden,q0:!!q0Playback,q1:!!q1Playback,retirementSettled:q1RetirementResult?.settled===true})`,
    }));
    const a = report.admission;
    if (!a.sameOrigin || a.version !== report.version || !a.loaded || !a.online || !a.visible || !a.usable || !a.generalWritesFalse || !a.controllerActivated || !a.closed || a.q0 || a.q1 || !a.retirementSettled) throw Error('CURRENT_IDLE_TAB_ADMISSION_FAILED');
    const listingTools = await bounded(client.listTools(), report.rpcDeadlineMs, 'NATIVE_TOOL_LIST_DEADLINE');
    report.nativeUploadAvailable = listingTools.tools.some(t => t.name === 'upload_file');
    if (!report.nativeUploadAvailable) throw Error('NATIVE_UPLOAD_UNAVAILABLE');
    report.completed = true;
  } catch (error) {
    report.failure = safeCode(error);
    report.errorClass = String(error.name).replace(/[^A-Za-z0-9_]/g, '').slice(0, 60);
  } finally {
    pid ??= transport?.pid;
    try {
      if (client) await bounded(client.close(), report.cleanupDeadlineMs, 'NATIVE_CLIENT_CLOSE_DEADLINE');
      else if (transport) await bounded(transport.close(), report.cleanupDeadlineMs, 'NATIVE_TRANSPORT_CLOSE_DEADLINE');
      report.clientClosed = true;
    } catch { report.clientClosed = false; report.completed = false; }
    if (pid) {
      try { process.kill(pid, 0); report.ownedMcpProcessExited = false; }
      catch (error) { report.ownedMcpProcessExited = error.code === 'ESRCH'; }
    } else report.ownedMcpProcessExited = true;
    report.finishedAt = new Date().toISOString();
    report.elapsedMs = Date.now() - started;
    report.cleanupComplete = report.clientClosed && report.ownedMcpProcessExited;
    report.stage = 'finished'; save();
    console.log(JSON.stringify(report));
    if (!report.completed || !report.cleanupComplete) process.exitCode = 1;
  }
}
if (require.main === module) main().catch(error => { console.log(JSON.stringify({ completed: false, failure: safeCode(error) })); process.exitCode = 1; });
module.exports = { candidatePages };
