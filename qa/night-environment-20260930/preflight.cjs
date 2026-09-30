'use strict';
// Local environment inspection only. No browser navigation, media, auth or writes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const workspace = path.dirname(root);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function capture(exe, args, options = {}) {
  const result = spawnSync(exe, args, { cwd: root, encoding: 'utf8', timeout: 15000,
    windowsHide: true, maxBuffer: 8 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new Error('LOCAL_CHECK_FAILED');
  return result.stdout;
}
function check(fn) {
  try { return fn(); } catch { return { available: false, error: 'local check unavailable' }; }
}
const productHashes = {
  'app.js': '291bde76ad7f649422603e1d735766b0fcc5091fb9a9214ce2991689f48818b0',
  'sw.js': 'f21666a44d0c65771ecdf18764eb0e63e43decd5283ffe75db6e6b1f711c144d',
  'index.html': 'ac1de0052dce7c0cb220ea46d7614cb5b19619bdef6f28ddf999e283256da0c1',
  'styles.css': 'b15ed7f05cd49ef014f36b418242dbcc92a7581bfbe64631d38502dcaf0199dc',
  'media/revision-pin.js': '6550cbed08542607cdf7720b17a18de7eeae01015296afdabb59d9b8f6169008'
};
const git = check(() => ({ available: true,
  canonicalRoot: path.resolve(capture('git', ['rev-parse', '--show-toplevel']).trim()).toLowerCase() === root.toLowerCase(),
  branch: capture('git', ['branch', '--show-current']).trim(),
  head: capture('git', ['rev-parse', 'HEAD']).trim(),
  productIdentity: Object.entries(productHashes).every(([file, expected]) => sha(fs.readFileSync(path.join(root, file))) === expected)
}));
const memory = check(() => {
  const snapshot = JSON.parse(capture('powershell.exe', ['-NoProfile', '-Command',
    'Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,FreeVirtualMemory | ConvertTo-Json -Compress']));
  return { available: true, freePhysicalKiB: snapshot.FreePhysicalMemory,
    freeVirtualKiB: snapshot.FreeVirtualMemory,
    physicalFloorKiBExclusive: 1048576, virtualFloorKiBExclusive: 1572864,
    existingLaunchFloorPassed: snapshot.FreePhysicalMemory > 1048576 && snapshot.FreeVirtualMemory > 1572864 };
});
const codexon = check(() => ({ available: true, remainingProcesses: Number(capture('powershell.exe',
  ['-NoProfile', '-Command', "@(Get-CimInstance Win32_Process -Filter \"Name = 'Codexon.exe'\" | Where-Object { $_.ExecutablePath -like 'C:\\Users\\jbs\\AppData\\Local\\Programs\\Codexon\\*\\Codexon.exe' }).Count"]).trim()) }));
const android = check(() => {
  const toolsDir = path.join(workspace, 'maintenance/tools');
  const setup = JSON.parse(fs.readFileSync(path.join(toolsDir, 'scrcpy-v4.1-setup.json'), 'utf8'));
  const install = path.join(toolsDir, 'scrcpy-v4.1/scrcpy-win64-v4.1');
  const adb = path.join(install, 'adb.exe');
  const scrcpy = path.join(install, 'scrcpy.exe');
  const archiveHashMatched = sha(fs.readFileSync(path.join(toolsDir, 'scrcpy-win64-v4.1.zip'))) === '5b12172b3264b2889f4583ee64752ce832e29bc8b1089dca81093459697165db';
  const adbVersion = capture(adb, ['version']).split(/\r?\n/).find(line => line.startsWith('Android Debug Bridge version ')) || null;
  const scrcpyVersion = capture(scrcpy, ['--version']).split(/\r?\n/).find(line => line.startsWith('scrcpy ')) || null;
  const deviceLines = capture(adb, ['devices', '-l']).split(/\r?\n/);
  const states = deviceLines.map(line => line.match(/^\S+\s+(device|unauthorized|offline)(?:\s|$)/)?.[1]).filter(Boolean);
  return { available: true, archiveHashMatched, recordedVendorHashMatched: setup.vendorHashMatched === true,
    adbVersion, scrcpyVersion, authorizedDevices: states.filter(s => s === 'device').length,
    unauthorizedDevices: states.filter(s => s === 'unauthorized').length,
    offlineDevices: states.filter(s => s === 'offline').length,
    serialsExported: false, settingsChanged: false,
    toolingReady: archiveHashMatched && !!adbVersion && !!scrcpyVersion };
});
const playwright = check(() => ({ available: true,
  existingDependency: fs.existsSync(path.join(root, 'qa/node_modules/playwright/package.json')),
  installedChrome: [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]
    .filter(Boolean).some(base => fs.existsSync(path.join(base, 'Google/Chrome/Application/chrome.exe'))) }));
const report = { schema: 'drive-original.night-environment/1', recordedAt: new Date().toISOString(),
  scope: 'Environment inspection only; actual work requires a later explicit start instruction',
  producerSha256: sha(fs.readFileSync(__filename)), git, memory, codexon, android, playwright,
  pcToolingReady: git.available && git.canonicalRoot && git.productIdentity && memory.existingLaunchFloorPassed === true
    && android.toolingReady === true && playwright.existingDependency === true && playwright.installedChrome === true,
  deviceReady: android.authorizedDevices === 1,
  browserSessionReadiness: 'Separately recheck live Chrome and existing same-account login; not inferred here',
  acceptanceTestsExecuted: false, credentialsRead: false, settingsChanged: false, productionChanged: false };
console.log(JSON.stringify(report, null, 2));
if (!report.pcToolingReady) process.exitCode = 1;
