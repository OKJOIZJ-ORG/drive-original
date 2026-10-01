'use strict';
// Pure orchestration: import performs no ADB, browser, network or private-file work.
const assert = require('node:assert/strict');
const SOURCE = '4a484e6f839d2e6c3eb83503acb08147362cb011';
const VERSION = '1.22.0-rc.31';
const PARAMS = Object.freeze({ enableThirdPartyCookieRestriction: true });
const BUDGET_MS = 240000;
async function gate(adapter) {
  const report = { schema: 'drive-original.rc31-android-cookie-gate/1', sourceCommit: SOURCE,
    version: VERSION, actualExecution: true, completed: false, rawIdentifiersExported: false,
    cookieOrTokenCopied: false, profilePreferencesChanged: false, artificialCookies: false,
    originalMediaMutated: false, receipts: [], cleanup: {} };
  let owned = false, attached = false;
  const end = adapter.now() + BUDGET_MS;
  const check = () => { if (adapter.now() >= end) throw Error('BOUNDED_DEADLINE'); };
  const step = (name, data) => { report.receipts.push({ name, ...data }); adapter.record?.(report); };
  try {
    await adapter.bootstrap(); check();
    const tools = await adapter.toolCapabilities();
    assert.ok(tools.newPage && tools.closePage && tools.listPages, 'OFFICIAL_MCP_CAPABILITY');
    step('official-MCP-capabilities', tools);
    const baseline = await adapter.pinOriginal();
    assert.ok(baseline.accountPresent && baseline.existingValidToken && baseline.playerClosed, 'ORIGINAL_PREFLIGHT');
    owned = true; await adapter.createOwnedPage(); check();
    attached = true; await adapter.attachOwnedPage();
    const owner = await adapter.ownerReceipt();
    assert.ok(owner.pageType && owner.taskCreated && owner.exactTarget && owner.sameBrowserContext && owner.mainFrame && owner.noIndependentFrames, 'FRAME_OWNER');
    step('dedicated-page-frame-owner', owner);
    await adapter.send('Network.enable', {});
    // Success recognizes the command and its only supplied argument in this installed runtime.
    // Failure is retained, never retried with weaker privacy or via a PC debug socket.
    await adapter.send('Network.setCookieControls', PARAMS);
    step('installed-runtime-command-recognized', { command: 'Network.setCookieControls', params: PARAMS, networkEnabled: true, dedicatedSession: true });
    await adapter.reloadOwned(); check();
    step('ordinary-reload-after-restriction', { reloaded: true, targetOwned: true });
    const proof = await adapter.sourceAndAccountProof(end);
    assert.equal(proof.sourceCommit, SOURCE); assert.equal(proof.version, VERSION);
    assert.ok(proof.publicMatched === 3 && proof.cacheMatched === 40 && proof.rootAliasMatched && proof.sameAccount && proof.existingValidToken && proof.controllerActivated && proof.noGoogleIframe, 'SOURCE_ACCOUNT_PROOF');
    step('current31-public-cache-existing-account-proof', proof);
    const rawReplay = await adapter.normalReplay(end); check();
    // Export only finite safe receipt fields, even if a private callback returns extras.
    const replay = Object.fromEntries(['normalNativeInput','noGoogleIframe','existingValidToken','sameAccount','exactSource31','originalBytePathQualified'].map(k=>[k,rawReplay[k]===true]));
    replay.routes = (rawReplay.routes||[]).map(r=>({route:['q0','q1','q2'].includes(r.route)?r.route:null,presentedFrames:Number.isSafeInteger(r.presentedFrames)?r.presentedFrames:0,...Object.fromEntries(['progressed','seekTargetFrame','closedSettled','exactPageMainFrame','noIndependentCookieDependentMediaTarget'].map(k=>[k,r[k]===true]))}));
    assert.ok(replay.normalNativeInput && replay.noGoogleIframe && replay.existingValidToken && replay.sameAccount && replay.exactSource31, 'NORMAL_APP_PROOF');
    assert.ok(replay.routes.length && replay.routes.every(r => ['q0', 'q1', 'q2'].includes(r.route) && r.presentedFrames >= 2 && r.progressed && r.seekTargetFrame && r.closedSettled && r.exactPageMainFrame && r.noIndependentCookieDependentMediaTarget), 'REPLAY_RECEIPT');
    step('normal-native-original-derived-replay', replay);
    // One actual adapted TS may qualify original read path and derived presentation.
    // This does not demand an additional Q0/native first-frame route or every format.
    report.originalQualified = replay.originalBytePathQualified;
    report.derivedQualified = replay.routes.some(r => ['q1','q2'].includes(r.route));
    report.completed = report.originalQualified && report.derivedQualified;
    if (!report.completed) report.failure = 'ORIGINAL_OR_DERIVED_SCOPE_REMAINS';
  } catch (error) {
    report.failure = /^[A-Z_]+$/.test(error.message) ? error.message : 'GATE_FAILED';
    if (adapter.isUnsupportedCookieCommand?.(error)) report.failure = 'INSTALLED_COOKIE_COMMAND_UNSUPPORTED';
  } finally {
    // Cleanup is ownership-scoped and attempted independently even after prior failures.
    if (owned) {
      try { report.cleanup.playerClosedSettled = await adapter.closeOwnedPlayer(); } catch { report.cleanup.playerClosedSettled = false; }
    }
    if (attached) {
      try { await adapter.detachOwnedSession(); report.cleanup.ownedSessionDetached = true; } catch { report.cleanup.ownedSessionDetached = false; }
    }
    if (owned) {
      try { await adapter.closeOwnedPage(); report.cleanup.ownedPageClosed = true; } catch { report.cleanup.ownedPageClosed = false; }
    }
    try { report.cleanup.originalTabAccountIntact = await adapter.originalIntact(); } catch { report.cleanup.originalTabAccountIntact = false; }
    try { await adapter.disconnect(); report.cleanup.ownedConnectionsRemoved = true; } catch { report.cleanup.ownedConnectionsRemoved = false; }
    if (!report.cleanup.originalTabAccountIntact || (owned && (!report.cleanup.playerClosedSettled || !report.cleanup.ownedPageClosed)) || (attached && !report.cleanup.ownedSessionDetached) || !report.cleanup.ownedConnectionsRemoved) {
      report.completed = false; report.cleanupFailure = 'OWNED_CLEANUP_UNCONFIRMED';
    }
    adapter.record?.(report);
  }
  return report;
}
module.exports = { gate, SOURCE, VERSION, PARAMS, BUDGET_MS };
