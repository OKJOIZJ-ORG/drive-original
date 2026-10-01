'use strict';
// Pure orchestration: import performs no ADB, browser, network or private-file work.
const assert = require('node:assert/strict');
const SOURCE = '4a484e6f839d2e6c3eb83503acb08147362cb011';
const VERSION = '1.22.0-rc.31';
const PARAMS = Object.freeze({ enableThirdPartyCookieRestriction: true });
const BUDGET_MS = 240000;
const bools=(object,keys)=>Object.fromEntries(keys.map(k=>[k,object?.[k]===true]));
const safeClass=e=>['Error','TypeError','RangeError','ReferenceError','SyntaxError','AssertionError','TimeoutError'].includes(e?.name)?e.name:'OtherError';
async function gate(adapter) {
  const report = { schema: 'drive-original.rc31-android-cookie-gate/4', sourceCommit: SOURCE,
    version: VERSION, actualExecution: true, completed: false, rawIdentifiersExported: false,
    cookieOrTokenCopied: false, profilePreferencesChanged: false, artificialCookies: false,
    originalMediaMutated: false, receipts: [], cleanup: {} };
  let owned = false, attached = false;
  let stage='bootstrap';
  const end = adapter.now() + BUDGET_MS;
  const check = () => { if (adapter.now() >= end) throw Error('BOUNDED_DEADLINE'); };
  const step = (name, data) => { report.receipts.push({ name, ...data }); adapter.record?.(report); };
  try {
    await adapter.bootstrap(); check();
    stage='official-MCP-capabilities';
    const tools = await adapter.toolCapabilities();
    const toolFields=bools(tools,['newPage','closePage','listPages','genericCDPCommand','runtimeToolInventoryChecked']);
    step('official-MCP-capabilities', toolFields);
    assert.ok(toolFields.newPage && toolFields.closePage && toolFields.listPages, 'OFFICIAL_MCP_CAPABILITY');
    stage='pin-original';
    const baseline = await adapter.pinOriginal();
    const baselineFields={valueReturned:baseline!==undefined&&baseline!==null,objectReturned:!!baseline&&typeof baseline==='object'&&!Array.isArray(baseline),versionExpected:baseline?.version===VERSION,...bools(baseline,['accountPresent','existingValidToken','playerClosed','authOnline','loaded'])};
    step('original-baseline-primitive-admission',baselineFields);
    assert.ok(baselineFields.objectReturned&&baselineFields.accountPresent && baselineFields.existingValidToken && baselineFields.playerClosed &&baselineFields.versionExpected&&baselineFields.authOnline&&baselineFields.loaded, 'ORIGINAL_PREFLIGHT');
    stage='create-owned-page';
    owned = true; await adapter.createOwnedPage(); check();
    stage='attach-owned-page';
    attached = true; await adapter.attachOwnedPage();
    stage='owned-frame-receipt';
    const owner = await adapter.ownerReceipt();
    step('dedicated-page-frame-owner', owner);
    assert.ok(owner.pageType && owner.taskCreated && owner.exactTarget && owner.sameBrowserContext && owner.mainFrame && owner.mainFrameStable && owner.frameScopeAdmitted, 'FRAME_OWNER');
    stage='network-enable';await adapter.send('Network.enable', {});
    // Success recognizes the command and its only supplied argument in this installed runtime.
    // Failure is retained, never retried with weaker privacy or via a PC debug socket.
    stage='cookie-command';await adapter.send('Network.setCookieControls', PARAMS);
    step('installed-runtime-command-recognized', { command: 'Network.setCookieControls', params: PARAMS, networkEnabled: true, dedicatedSession: true });
    stage='owned-reload';const reloadOwner=await adapter.reloadOwned();check();
    step('frame-owner-after-ordinary-reload',reloadOwner);
    assert.ok(reloadOwner.mainFrame&&reloadOwner.mainFrameStable&&reloadOwner.frameScopeAdmitted,'RELOAD_FRAME_OWNER');
    step('ordinary-reload-after-restriction', { reloaded: true, targetOwned: true });
    stage='source-account-proof';const proof = await adapter.sourceAndAccountProof(end);
    const proofFields={sourceExpected:proof?.sourceCommit===SOURCE,versionExpected:proof?.version===VERSION,public3:proof?.publicMatched===3,cache40:proof?.cacheMatched===40,...bools(proof,['rootAliasMatched','sameAccount','existingValidToken','controllerActivated','noGoogleIframe'])};
    step('source-account-primitive-admission',proofFields);
    assert.ok(Object.values(proofFields).every(Boolean), 'SOURCE_ACCOUNT_PROOF');
    step('current31-public-cache-existing-account-proof', proof);
    stage='normal-native-replay';const rawReplay = await adapter.normalReplay(end); check();
    stage='replay-frame-receipt';const afterOwner=rawReplay?.ownedFrameAfterReplay;
    step('frame-owner-after-normal-native-replay',afterOwner||{receiptMissing:true});
    assert.ok(afterOwner?.mainFrame&&afterOwner.mainFrameStable&&afterOwner.frameScopeAdmitted,'REPLAY_FRAME_OWNER');
    // Export only finite safe receipt fields, even if a private callback returns extras.
    const replay = bools(rawReplay,['normalNativeInput','noGoogleIframe','existingValidToken','sameAccount','exactSource31','originalBytePathQualified']);
    replay.routes = (Array.isArray(rawReplay?.routes)?rawReplay.routes.slice(0,10):[]).map(r=>({route:['q0','q1','q2'].includes(r?.route)?r.route:null,presentedFrames:Number.isSafeInteger(r?.presentedFrames)?r.presentedFrames:0,...bools(r,['progressed','seekTargetFrame','closedSettled','exactPageMainFrame','noIndependentCookieDependentMediaTarget'])}));
    stage='normal-native-replay-admission';
    const sourceReceipt=require('./source-receipt-sanitize.cjs').reduce(rawReplay?.originalSourceReceipt);
    step('post-normal-close-exact-Q1-source-receipt',sourceReceipt);
    step('normal-replay-primitive-admission',replay);
    assert.ok(replay.normalNativeInput && replay.noGoogleIframe && replay.existingValidToken && replay.sameAccount && replay.exactSource31, 'NORMAL_APP_PROOF');
    assert.ok(replay.routes.length && replay.routes.every(r => ['q0', 'q1', 'q2'].includes(r.route) && r.presentedFrames >= 2 && r.progressed && r.seekTargetFrame && r.closedSettled && r.exactPageMainFrame && r.noIndependentCookieDependentMediaTarget), 'REPLAY_RECEIPT');
    step('normal-native-original-derived-replay', replay);
    // One actual adapted TS may qualify original read path and derived presentation.
    // This does not demand an additional Q0/native first-frame route or every format.
    report.originalQualified = replay.originalBytePathQualified;
    report.originalByteScope='Q1_ORIGINAL_BYTE_READ_ONLY';report.q0CookieCoverage='UNKNOWN';
    report.derivedQualified = replay.routes.some(r => ['q1','q2'].includes(r.route));
    report.completed = report.originalQualified && report.derivedQualified;
    if (!report.completed) report.failure = 'ORIGINAL_OR_DERIVED_SCOPE_REMAINS';
  } catch (error) {
    report.failureStage=stage;report.safeErrorClass=safeClass(error);
    const codes=['BOUNDED_DEADLINE','OFFICIAL_MCP_CAPABILITY','ORIGINAL_PREFLIGHT','FRAME_OWNER','RELOAD_FRAME_OWNER','REPLAY_FRAME_OWNER','SOURCE_ACCOUNT_PROOF','NORMAL_APP_PROOF','REPLAY_RECEIPT','ORIGINAL_OR_DERIVED_SCOPE_REMAINS'];
    report.failure = codes.includes(error?.message)?error.message:'STAGE_FAILED';
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
