'use strict';
// Connect the official Chrome DevTools MCP to the already authorized Android.
// Read readiness only; never navigate, click, play media, fetch auth or copy IDs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const adb = path.join(path.dirname(root), 'maintenance/tools/scrcpy-v4.1/scrcpy-win64-v4.1/adb.exe');
const cache = path.join(process.env.LOCALAPPDATA, 'npm-cache/_npx');
const expectedOrigin = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
function command(exe, args) {
  const r = spawnSync(exe, args, { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  if (r.error || r.status !== 0) throw new Error('LOCAL_COMMAND_FAILED');
  return r.stdout.trim();
}
function packageRoot(name) {
  const matches = fs.readdirSync(cache).map(dir => path.join(cache, dir, 'node_modules', name))
    .filter(dir => fs.existsSync(path.join(dir, 'package.json')));
  if (!matches.length) throw new Error('EXISTING_DEPENDENCY_MISSING');
  return matches[0];
}
function contents(result) {
  if (result.isError) throw new Error('MCP_TOOL_FAILED');
  return result.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
}
const report = { schema: 'drive-original.android-readiness/1', recordedAt: new Date().toISOString(),
  scope: 'Environment readiness only; no product or acceptance work',
  producerSha256: hash(fs.readFileSync(__filename)), authorizedDevices: 0,
  serialsExported: false, privateIdentifiersOrCredentialsExported: false,
  navigationOrPlaybackPerformed: false, authenticationRequestsPerformed: false,
  settingsChanged: false, productionChanged: false };
let client, transport, serial, port;
(async () => {
  try {
    const devices = command(adb, ['devices', '-l']).split(/\r?\n/)
      .filter(line => /^\S+\s+device(?:\s|$)/.test(line));
    report.authorizedDevices = devices.length;
    if (devices.length !== 1) throw new Error('REQUIRE_ONE_AUTHORIZED_DEVICE');
    serial = devices[0].split(/\s+/)[0];
    report.deviceModel = command(adb, ['-s', serial, 'shell', 'getprop', 'ro.product.model']);
    report.androidRelease = command(adb, ['-s', serial, 'shell', 'getprop', 'ro.build.version.release']);
    port = Number(command(adb, ['-s', serial, 'forward', 'tcp:0', 'localabstract:chrome_devtools_remote']));
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_OWNED_FORWARD');
    const sdk = packageRoot('@modelcontextprotocol/sdk');
    const mcp = packageRoot('chrome-devtools-mcp');
    const { Client } = await import(pathToFileURL(path.join(sdk, 'dist/esm/client/index.js')).href);
    const { StdioClientTransport } = await import(pathToFileURL(path.join(sdk, 'dist/esm/client/stdio.js')).href);
    report.mcpVersion = JSON.parse(fs.readFileSync(path.join(mcp, 'package.json'), 'utf8')).version;
    transport = new StdioClientTransport({ command: process.execPath,
      args: [path.join(mcp, 'build/src/bin/chrome-devtools-mcp.js'), `--browserUrl=http://127.0.0.1:${port}`,
        '--categoryExtensions=false', '--no-usage-statistics', '--no-performance-crux', '--redactNetworkHeaders', `--workspace=${root}`],
      stderr: 'pipe', env: { ...process.env, CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1' } });
    transport.stderr.on('data', () => {});
    client = new Client({ name: 'drive-original-android-environment', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);
    const listed = contents(await client.callTool({ name: 'list_pages', arguments: {} }));
    const pages = listed.split(/\r?\n/).flatMap(line => {
      const match = line.match(/^(\d+): (https?:\/\/\S+)/);
      if (!match) return [];
      let origin; try { origin = new URL(match[2]).origin; } catch { return []; }
      return origin === expectedOrigin ? [{ id: Number(match[1]) }] : [];
    });
    report.actualAndroidMcpListPassed = true;
    report.expectedCandidateTabs = pages.length;
    if (pages.length !== 1) throw new Error('REQUIRE_ONE_EXISTING_CANDIDATE_TAB');
    const fn = `() => {
      const visible = id => { const e = document.getElementById(id); if (!e) return false;
        const s = getComputedStyle(e); return !e.hidden && s.display !== 'none' && s.visibility !== 'hidden'; };
      return { expectedOrigin: location.origin === ${JSON.stringify(expectedOrigin)},
        version: typeof APP_VERSION === 'string' ? APP_VERSION : null,
        setupVisible: visible('setupView'), libraryVisible: visible('libraryView'),
        accountKeyPresent: typeof state !== 'undefined' && Boolean(state.authAccountKey),
        folderCount: typeof state !== 'undefined' && Array.isArray(state.folders) ? state.folders.length : null,
        serviceWorkerControlled: Boolean(navigator.serviceWorker.controller),
        mediaVisible: visible('mediaOverlay'), documentReadyState: document.readyState,
        sameAccountWithPcIndependentlyProven: false };
    }`;
    const evaluated = contents(await client.callTool({ name: 'evaluate_script', arguments: { pageId: pages[0].id, function: fn, waitForStableDom: false } }));
    const match = evaluated.match(/```json\s*([\s\S]*?)```/);
    if (!match) throw new Error('EXPECTED_SAFE_JSON_RESULT');
    report.page = JSON.parse(match[1]);
    report.actualAndroidMcpEvaluatePassed = true;
    report.loginReadyObserved = report.page.accountKeyPresent && report.page.libraryVisible && !report.page.setupVisible;
    report.passed = report.page.expectedOrigin && report.actualAndroidMcpEvaluatePassed && report.loginReadyObserved;
  } catch (error) {
    report.passed = false;
    report.failure = /^[A-Z_]+$/.test(error.message) ? error.message : 'READINESS_OPERATION_FAILED';
  } finally {
    if (client) await client.close().then(() => { report.ownedMcpClientClosed = true; }).catch(() => { report.ownedMcpClientClosed = false; });
    else if (transport) await transport.close().catch(() => {});
    if (port && serial) { command(adb, ['-s', serial, 'forward', '--remove', `tcp:${port}`]); report.ownedAdbForwardRemoved = true; }
    fs.writeFileSync(path.join(__dirname, 'readiness-result.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  }
})();
