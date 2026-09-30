'use strict';

// Documentary reconciliation only: Git/fs reads and writes to this new leaf.
// No test, browser, network, credential, private readback or product operation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const pin = '2a6de0be6a0cde0838dd495c5ba3a0472ee37b6a';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const git = (...args) => cp.execFileSync('git', args, { cwd: root, maxBuffer: 8 * 1024 * 1024 });
const readPinned = file => git('show', `${pin}:${file}`);
const baselinePath = 'qa/candidate-rc13-qualification/report.json';
const baselineBytes = fs.readFileSync(path.join(root, baselinePath));
const baselineHash = '73ab0ac4d71e8f377155a95859ae7d5ffb857d84f78a90b94433726d4004c4a6';
if (sha(baselineBytes) !== baselineHash) throw new Error('Preserved baseline bytes changed');
const baseline = JSON.parse(baselineBytes);
const specPath = 'memory/specs/Drive-Original_Sol-Ultra_Implementation-Pack_v3.0_2026-09-19.md';
const spec = readPinned(specPath).toString('utf8').split(/\r?\n/);
const originals = new Map();
spec.forEach((line, i) => {
  const m = line.match(/^\| (QA-[A-Z]{2}-\d{2}) \| (.*?) \| (.*?) \|$/);
  if (m) originals.set(m[1], { scenario: m[2], expected: m[3], path: specPath, line: i + 1 });
});
const overlayPath = 'qa/rc16-remaining-acceptance/README.md';
const oldOverlay = new Map();
readPinned(overlayPath).toString('utf8').split(/\r?\n/).forEach(line => {
  const m = line.match(/^\| (QA-[A-Z]{2}-\d{2}) \|/);
  if (m) oldOverlay.set(m[1], line);
});

const owners = {
  B: { paths: [baselinePath, 'qa/candidate-rc13-qualification/qualification-matrix.md'], scope: 'Preserved rc13 original69 baseline; source570f9c38506d1e426c33cf65b73836d32bf872c0. Local ignored historical evidence, not a new run.' },
  C: { paths: ['memory/CORPUS-RC10-20260928.md', 'qa/rc16-corpus-tracks/README.md', 'qa/rc16-corpus-tracks/runtime-boundary.json'], scope: 'Dated actual36 risk representatives/15TS structures; prepared bounded new sparse facade; actual new invocation stopped before corpus code by fileURL access.' },
  I: { paths: ['memory/ISO-TRACKS-20260929.md'], scope: 'One actual large front-moov ISO structural track probe; sample/config/HDR/VFR proof excluded.' },
  F: { paths: ['qa/v2-live-format-playback-rc12/README.md', 'qa/v2-live-webm-rc13/README.md'], scope: 'Historical actual selected largeISO/declaredMKV/AVI/WebM desktop decode/seek/close, not full current corpus.' },
  Q0: { paths: ['qa/q0-provider-product/README.md', 'qa/q0-revision-pin-disposable-rc13b/README.md'], scope: 'Original immutable revision contract, local native path and separate actual disposable A/B revision proof.' },
  Q12: { paths: ['memory/Q1-Q2-INTEGRATION-20260930.md', 'qa/q2-general-product-integration/README.md'], scope: 'Narrow qualified Q1/Q2 packet/clock/color/pixel/audio transformation and native failure/owner contracts; not universal format admission.' },
  Q3: { paths: ['memory/Q3-FEASIBILITY-20260930.md', 'qa/q3-browser-execution/README.md'], scope: 'Synthetic unsupported MPEG4 to lossyVP9 feasibility only; actual need and product activation unproven.' },
  U12: { paths: ['qa/player-input-quality/README.md', 'qa/player-input-quality-audit.cjs', 'qa/library-quality/README.md'], scope: 'Trusted browser DOM mouse/touch/keyboard and4viewports; media counters/signals synthetic. Pointer-only leave-hide is not asserted.' },
  U16: { paths: ['qa/rc15-player-ui-qualification/README.md', 'qa/rc15-player-ui-qualification/results.json'], scope: 'Fixedrc16 six native actual-app synthetic Q0/AC3/EAC3 desktop/touch cases,12target seeks, closed/reopen owners.' },
  R16: { paths: ['qa/rc16-native-resource/README.md', 'qa/rc16-native-resource/summary.json'], scope: 'Fixedrc16 mixed50/150native seeks,170each wrappers finalized; explicit5second observer Network-reset cadence. Not normal-runtime native ceiling.' },
  L16: { paths: ['qa/rc16-q2-longrun/README.md', 'qa/rc16-q2-longrun/summary.json'], scope: 'Fixedrc16 synthetic420second automaticQ2 uninterrupted native end,299/360frame clocks, complete audio packet counts and settled app/SWclose; no actual expiry/audibility.' },
  A17: { paths: ['qa/rc17-actual-account/README.md', 'qa/rc17-actual-account/results.json'], scope: 'Fixedrc17 actual designated same-account TS trusted paused10/50/90/repeated50 targetframes and later seeked/loaderfalse; normalupdate and close. No audio/physical/fullrow.' },
  N17: { paths: ['qa/rc17-seek-native/README.md', 'qa/rc17-seek-native/results.json'], scope: 'Fixedrc17 synthetic Q0/AAC andQ2/AC3 six paused10/50/90seeks; frame-before-seeked retained,200mssettled, trustedclose.' },
  I16: { paths: ['qa/rc16-image-format/README.md', 'qa/rc16-image-format/results.json', 'qa/rc16-image-format/png-wrong-video-mime-results.json'], scope: 'Fixedrc16 native7supported image cases, original bytes/alpha/paint/close/reopen; saved WebP card failure and separate PNG-declared-video owner counterexample.' },
  W18: { paths: ['qa/rc18-webp-card/README.md', 'qa/rc18-webp-card/results.json', 'memory/WEBP-CARD-20260930.md'], scope: 'rc18 staticWebP card repair: focused3/native4, paintedstaticcards/animatedviewers/alpha/cleanup. No whole image corpus/profile/device promotion.' },
  D18: { paths: ['memory/CANDIDATE-RC18-20260930.md', 'qa/candidate-rc18-delivery/results.json', 'qa/candidate-rc18-delivery/actual-update.json', 'qa/candidate-rc18-delivery/source-readiness.json'], scope: 'Fixedrc18 52public/40cached,6private404,cold/offline, source/package/full563 and actual normalexisting-account update. No historical secret absence.' },
  T18: { paths: ['qa/rc18-priority-latency/README.md', 'qa/rc18-priority-latency/actual18-summary.json', 'qa/rc18-priority-latency/actual18-safe-record.json'], scope: 'One fixedrc18 paused50% actual TS trial13.3749s input-to-frame; serial read waits dominate observed path.300msstill-seeking correctloader, later settledtime unmeasured; notp95.' },
  H16: { paths: ['qa/rc16-hosted-security/README.md', 'qa/rc16-hosted-security/live-results.json'], scope: 'Historical actual rc.16: 12 anonymous 401/403/400 denials, no-store and fixed error redaction. Not refreshed rc.18 authenticated boundaries.' },
  H18: { paths: ['qa/rc18-hosted-settings/README.md', 'qa/rc18-hosted-settings/results.json', 'qa/rc18-hosted-settings/local-verification.json'], scope: 'Actual5readonlycontrol-planeGETs with activeWorker before/after100%:Logpushfalse,Tailconsumersfalse; observabilityexplicitnull/omitted, booleans/rates unresolved. No logs/customerplan read.' },
  S: { paths: ['memory/STATE-NORMAL-20260928.md', 'memory/STATE-SNAPSHOT-20260928.md', 'memory/STATE-RECOVERY-20260928.md'], scope: 'Historical actual same-account stateunion/legacy/ownwriter/normaldesktop sync/reload and protectedbackup; not two physicaldevices/newclient fullmigration.' },
  M: { paths: ['memory/DISPOSABLE-20260928.md', 'qa/v2-disposable-live/README.md'], scope: 'Historical actual newly-created allowlisted canonical-controller move/trash/restore/readback; normalgallery writesfalse and finalrestoration/remnantsnotfullyqualified.' },
  A: { paths: ['memory/Q1-LIVE-20260928.md', 'memory/PC-POSTREBOOT-20260929.md'], scope: 'Historical actual priority/renewal; currentexpiry/nativeOShiddenreturn not established.' },
};

// Every entry names a closed slice, not the whole criterion. The baseline text
// and original scenario/expected result are copied verbatim into the output.
const updates = {
  'QA-TR-01': ['F,Q0,R16,D18', 'Historical actual 4.6 GB first frame and bounded local Q0/cold assets retained.', 'Current large cold Q0 first frame/progress/body-count trace plus required devices; rc.18 TS seek is not cold MP4 proof.', 'actual-account,physical-device'],
  'QA-TR-02': ['B,I,C', 'Local tail-index fixture qualified; actual inspected ISO is front-moov.', 'Actual tail-index MP4/MOV topology and bounded start/seek if present; do not replay front-moov or declare absence from the old sample.', 'corpus-permission,actual-account'],
  'QA-TR-03': ['A17,N17,T18,U16', 'Actual rc.17 designated TS 10/50/90/repeated50 target frames, paused settlement and close; synthetic rc.17 Q0/Q2 six seeks.', 'Actual independent audio, other selected Q routes and same-version devices. rc.19 reuse needs its own frame/owner/network discriminator.', 'actual-account,physical-device,rc19-in-progress'],
  'QA-TR-10': ['Q0,Q12', 'Immutable Q0 local fences and actual disposable revision A/B; Q1/Q2 changed-source rejection/native abort evidence retained.', 'Full changed-source route/recovery mapping remains broader than these slices. No personal-original mutation or additional product change is selected here.', 'actual-account,route-coverage'],
  'QA-TR-12': ['A,L16,A17', 'Native synthetic 420 s Q2 crosses 299/360 s, reaches real ended/source EOF, then full worker/app/SW close.', 'Actual expiry, later Range/seek, hidden30s/native OS return and position/list retention; synthetic longrun does not explain the historical actual 299 s incident.', 'actual-account,native-os-return,physical-device'],
  'QA-FM-01': ['C,I,F,Q12,Q3', 'Dated 36 representatives/15 TS and one ISO track probe; selected native playbacks retained.', 'Fresh complete canonical catalog and stable account/version mapping, then max5 remaining ISO +1 WebM +2 metadata-directed unknowns after fileURL permission. No full36 prefix/15TS replay. Exact private version continuity is unavailable; defer largest metadata ISO without claiming identity with the prior tested version.', 'corpus-permission,physical-device'],
  'QA-FM-02': ['F,Q12,A17', 'Actual designated TS/declared MKV/AVI and strict Q1 encoded-video/clock preservation saved.', 'Other actual container/track combinations, audio/selection and devices outside strict admission remain unqualified.', 'corpus-permission,physical-device'],
  'QA-FM-03': ['Q12,L16,U16,N17', 'Synthetic AC3/EAC3 video-copy/native Opus, quality oracles, 420 s Q2 and paused seeks qualified.', 'Actual AC3/EAC3 presence/profile fit and audible/device proof. Stereo48kHz/no-B/explicit-color/unfragmented admission is narrow.', 'corpus-permission,physical-device'],
  'QA-FM-04': ['Q3,C', 'Synthetic unsupported MPEG4-to-VP9 feasibility only.', 'Independently confirm an actual unsupported codec/config, then implement required bounded product Q3 admission/owners/resources. Q3 absence and product activation are both unproven.', 'corpus-permission,conditional-product-implementation'],
  'QA-FM-05': ['F,Q12', 'Actual SAR/TS clocks and synthetic SAR/color/source-clock preservation saved.', 'Actual multi-audio/silent/subtitle/rotation/VFR topology, track selection/timing and devices; extension does not establish these.', 'corpus-permission,physical-device'],
  'QA-FM-06': ['I,C', 'Actual ISO track probe explicitly excludes HDR/depth/config proof.', 'Actual HDR/high-depth presence is unknown; inspect bounded configs before conditional N/A or preservation/transform labels.', 'corpus-permission,conditional-product-implementation'],
  'QA-FM-07': ['I16,W18', 'Native painted viewer animation/alpha/original bytes; rc.18 static WebP card repair with four native cases and three focused checks.', 'Actual corpus/device viewers and other loop/profile/timing variants remain unclaimed. The known animated-list defect is resolved; no repeat card suite is necessary.', 'corpus-permission,physical-device'],
  'QA-FM-08': ['I16,W18', 'Native large PNG/BMP/alpha, wrong image subtype and filename cases display/close/reopen. Supported PNG declared video/mp4 is a saved display failure.', 'Required local unit20: identity-fenced byte signature/owner dispatch for the PNG-declared-video case. Preserve original bytes, account/version/Range budgets; metadata alone cannot authorize fallback. Full JPEG/corpus/devices remain.', 'necessary-local-product,corpus-permission,physical-device'],
  'QA-FM-09': ['B,Q12,I16', 'Malformed Range/storage and native corrupt EAC3: zero append, decoder opened=closed. PNG/video mismatch has bounded error, no viewed mark and settled close.', 'Unit20 needs unsafe HTML/JSON/truncated/unsupported signature controls in the same classification unit. Actual corruption requires independent exact bytes after auth/network/version exclusion.', 'necessary-local-discriminator,corpus-permission'],
  'QA-AU-01': ['A,S,D18', 'Historical actual renewal, current existing-account update/reload and deterministic expiry qualified at their scopes.', 'Current natural expiry/recovery with the same position/list/selection. Account presence is not renewal proof; no forced revoke/regrant.', 'actual-account,physical-device'],
  'QA-AU-06': ['B,D18', 'Direct reader architecture and actual normal account restore/playback avoid the Google iframe.', 'Actual blocked-third-party-cookie setting/session scenario and iPhone contexts; use an approved isolated context, not global security/cookie changes.', 'browser-setting,actual-account,physical-device'],
  'QA-AU-10': ['S,D18', 'Actual same-account legacy union/backup/writer and current existing-client update retained.', 'New origin/client binding and before/after counts, tombstones, writer identity and recovery across required contexts; same-client update is not migration.', 'actual-account,new-client-context,physical-device'],
  'QA-ST-01': ['S,B', 'Writer union/desktop normal state and synthetic two-client convergence retained.', 'Two independent physical foreground contexts receive likes/unlikes/viewed without reload/refocus, including offline/conflict cases.', 'two-physical-devices'],
  'QA-MU-01': ['M,B', 'Actual restricted allowlisted canonical trash/readback proof retained.', 'Normal gallery remains intentionally writes=false. A distinct UI route requires the exact approved new-disposable allowlist; do not enable global writes or repeat a proven controller write merely to relabel the row.', 'normal-ui-write-policy,disposable-account'],
  'QA-MU-02': ['M,B', 'Actual restricted allowlisted move and independent parents confirmation retained.', 'Normal gallery target discovery is write-disabled/unqualified; same narrow allowlist requirement as MU01, not another proven controller write.', 'normal-ui-write-policy,disposable-account'],
  'QA-MU-09': ['M', 'Actual API readback proves only the scoped cloud state.', 'Compare the same approved disposable ID/state privately through Drive web and G: with timestamps, distinguishing desktop-sync delay.', 'desktop-sync-access,disposable-account'],
  'QA-MU-10': ['M,S', 'Restricted restore/recovery and no permanent DELETE retained; final recoverably trashed file and two new folders remain historical remnants.', 'Inspect private journal/pre-state/current identity/account, then restore/confirm only approved exact targets. No broad cleanup or inferred pre-state. Current private freshness was not inspected here.', 'private-recovery-precondition,disposable-account'],
  'QA-UI-01': ['U12,U16,A17,N17,T18', 'Trusted DOM/native Q0/Q2 input; actual rc.17 paused seek loader settles without another resumed frame. Later rc.18 settlement agrees.', 'Required physical/input environments remain. rc.18 still-seeking at300ms correctly retains the loader; it is not a persistent-loader regression.', 'physical-device'],
  'QA-UI-02': ['U12,U16', 'Trusted bottom reveal/hidden center/dismiss and stable44px entry. app.js timer/pointerleave owns the320ms desktop hide.', 'One mandatory unobserved clause: trusted bottom→center movement only, wait for actual hide, with zero playback action and no hidden-state reveal. Saved audits use center click-dismiss; no defect is inferred.', 'necessary-local-read-only-check'],
  'QA-UI-03': ['U12,U16', 'Native44px entry/reveal/dismiss passes desktop touch emulation and actual decoded synthetic cases.', 'Physical mobile hit/reveal/dismiss and the iPhone user-reported boundary; simulation is not physical proof.', 'physical-device'],
  'QA-UI-04': ['U12,U16', 'Injected exhausted-original recovery has one dismissible owner, zero retained source/external preview and trusted close.', 'Actual exhausted transport/explicit external action and physical recovery contexts; UI injection does not induce the real transport failure.', 'actual-account,physical-device'],
  'QA-UI-05': ['U12,U16', 'Saved audit explicitly asserts click-then-Space and native Tab/button-Space once-only actions; native cases add trusted Space/Tab.', 'Physical platform focus behavior remains. Do not repeat the already-proven finite keyboard clauses.', 'physical-device'],
  'QA-UI-06': ['U12,U16', 'Native DOM keyboard reveal/focus transfer; native Tab controls usable.', 'Physical VoiceOver and device hidden-control traps/reentry; keyboard fixtures cannot substitute for VoiceOver.', 'physical-device,assistive-technology'],
  'QA-UI-07': ['U12,B', 'Four-viewport DOM touch cancellation/movement/second-touch and selection-owner fixtures retained.', 'Physical long-press/context-menu/drag/callout conflicts and interruption remain; no repeated synthetic cancellation suite.', 'physical-device,native-os-input'],
  'QA-UI-08': ['B,U12', 'Edge/interior transition identity, generation, cancellation and once-only contracts retained.', 'Physical native edge back/return, custom PWA versus Safari system gesture and delayed ghost navigation.', 'physical-device,native-os-input'],
  'QA-UI-09': ['U12,U16', 'Four-viewport app fullscreen/rotation/simulated safe area; native two-size geometry retained.', 'Physical rotation/PWA/native OS fullscreen and safe-area close/seek access; viewport resize is not that proof.', 'physical-device,native-os-fullscreen'],
  'QA-UI-10': ['U12,U16,S,A17,T18', 'Quiet loading, newer library status ownership, native poster/reopen and actual paused seek presentation pass their scopes.', 'Actual device sync/preparation/status cohesion. A pending current seek should show loading; no repeat of resolved presentation/WebP polish.', 'actual-account,physical-device'],
  'QA-LF-01': ['R16,L16', '50mixed/150seeks,170 each finalized wrappers, zero closed workers/URLs; renderer66.4–77.7MiB cycle12–50 under explicit Network reset.420s Q2 close passes.', 'Normal-runtime total native ceiling and physical endurance remain unknown. Network observer retention was discriminated; no product leak patch is justified. Historical cold OtherError1of4 remains unexplained.', 'normal-runtime-resource,physical-device,historical-unexplained-failure'],
  'QA-SE-02': ['D18,H16,H18', 'Exact public/cache/private404/package; backend before/after at100%; actual Logpush=false/Tail consumers absent; fixed diagnostic source shape.', 'Live observability collection/enabled/sampling/persistence is null/omitted. Explicit authenticated settings visibility needed. Actual retention/history/all-process secret absence is unproven; no logs/customer-plan read.', 'hosted-settings-visibility,historical-security-evidence'],
  'QA-RP-01': ['A17,D18,F', 'Current actual desktop TS frame/seek/close and fixed version; historical selected formats retained.', 'Exact same original ID/version across PC/iPhone Chrome tab/PWA/Safari, audio/progress/seek/close and first-failure layer. One browser/iframe is not acceptance.', 'physical-device,cross-context-account'],
  'QA-SL-01': ['A,S,D18', 'Token/session contracts, historical renewal and current existing-account update retained.', 'Current actual expiry/revocation/reconnect and state/context preservation. Natural expiry is observable without forcing grants; intentional revocation needs its own authorized user action.', 'actual-account,user-controlled-revocation,physical-device'],
  'QA-SL-02': ['B', 'Deterministic persisted lease/revision/multi-owner single-flight and partial-refresh contracts qualified.', 'Actual two-device/serverless multi-instance concurrent refresh, atomic revisions and preserved refresh state; no credential export or forced fault.', 'two-physical-devices,authenticated-security'],
  'QA-SL-03': ['B,D18,H16,H18', 'Historical rc.16 anonymous12 denials/redaction/no-store; current backend settings identity and public cache fenced.', 'Current authenticated session/account/revision/expiry boundaries and unresolved collection/persistence/retention. No whole authenticated-negative or historical privacy claim.', 'authenticated-security,hosted-settings-visibility,historical-security-evidence'],
  'QA-SL-04': ['B,D18,H18', 'Free/no-card architecture, bounded local quota failures and exact candidate readbacks/delivery retained.', 'Actual selected customer plan/quota/usage/CPU/storage was not read. Bounded read-only selected-resource metrics/limits may discriminate this; no load storm or paid switch. Generic Free docs do not prove the account plan.', 'account-control-plane,controlled-limit-scenario'],
  'QA-SL-05': ['A,B', 'Historical user-confirmed PWA return and deterministic callback-error contracts retained.', 'Actual iPhone Chrome tab/PWA/Safari entry→callback→correct session/context return; no same-origin cookie-sharing inference.', 'physical-device,oauth-callback-context'],
  'QA-SL-07': ['S,D18', 'Actual legacy/appData union/backups/old-code compatibility and current existing-client update retained.', 'New client/origin before/after counts, tombstones, writer identity and recovery across contexts; existing account restoration is not new-client visibility.', 'new-client-context,actual-account,physical-device'],
  'QA-SL-08': ['B,D18,H16,H18', 'Exact rc.18 private-public404/cache and active backend identity; historical anonymous denials and unchanged production record.', 'Authenticated file/API/diagnostic account permission matrix remains. G6 main/push/production replacement requires separate authority and served proof; candidate verification is distinct.', 'authenticated-security,production-authority'],
};

const rows = baseline.rows.map(row => {
  const original = originals.get(row.id);
  if (!original) throw new Error(`Original spec ID absent: ${row.id}`);
  const update = updates[row.id];
  let disposition = row.status === 'passed' ? 'historical-contract-qualified-retained'
    : row.status === 'not-applicable' ? 'conditional-not-applicable-retained'
    : row.status === 'blocked' ? 'blocked-whole-criterion-unqualified' : 'partial-whole-criterion-unqualified';
  if (row.id === 'QA-FM-08') disposition = 'partial-unresolved-supported-image-counterexample';
  if (row.id === 'QA-UI-02') disposition = 'partial-unobserved-pointer-only-leave-clause';
  const additionalKeys = row.id === 'QA-SW-01' ? ['D18']
    : row.id === 'QA-ST-03' ? ['I16', 'W18']
    : row.id === 'QA-TR-09' ? ['A17', 'N17', 'R16']
    : row.id === 'QA-SE-01' ? ['H16', 'D18'] : [];
  return {
    id: row.id, requirement: row.requirement,
    baselineStatus: row.status, baselineEvidence: row.evidence,
    originalSpec: original,
    rc16HistoricalOverlay: oldOverlay.get(row.id) || null,
    currentStatus: row.status, disposition, wholeRowPromoted: false,
    evidenceKeys: update ? update[0].split(',') : ['B', ...additionalKeys],
    directScopedEvidence: update ? update[1] : 'Original qualified contract/conditional exclusion retained at its dated source; no complete new-row qualification was run. See baselineEvidence and evidence owners for any added corroborating slice.',
    remainingGap: update ? update[2] : row.status === 'not-applicable'
      ? row.id === 'QA-FM-10' ? 'HLS notselected; reopen only on HLSadoption. Otherformat/seekgoals notwaived.'
        : 'B-media relay notselected (B-auth/directDrivebytes); reopen onrelayadoption. Q2/Q3notwaived.'
      : 'No additional local contract gap identified from the inspected records. Original account/device/production exclusions remain; this does not assert every old passing contract reran onrc18 or future19.',
    remainingBoundaryCategories: update ? update[3].split(',') : [],
    finiteNextAction: row.id === 'QA-FM-08' ? {
      owner: 'root schedules required local unit20 after rc19 closure',
      acceptance: ['QA-FM-08', 'TR-04', 'MEDIA-07'],
      source: { pin, path: 'app.js', functions: [
        { name: 'openMediaSource', startLine: 7609, metadataIsVideoLine: 7630, kindDispatchLine: 7692 },
        { name: 'startInitialOriginalPlayback', startLine: 7706 },
        { name: 'startOriginalRangePlayback', startLine: 7743 },
        { name: 'openPlayer', startLine: 5336, controlsKindLine: 5362 },
        { name: 'updateQualityDisplay', startLine: 10270, metadataIsVideoLine: 10277 },
      ] },
      failureEvidence: 'qa/rc16-image-format/png-wrong-video-mime-results.json',
      smallestDiscriminator: 'Supported PNG bytes declared video/mp4 must enter the canonical image owner after identity-fenced byte classification, display unchanged bytes, keep video hidden, preserve presentation/viewed policy and settle close; HTML/JSON/truncated/unsupported bytes must not be rerouted from metadata alone.',
      persistenceEvidence: 'Git app.js diff e57d7b5b3154a2a838d01f631cf71fa063044280..f6749c1a1b1a8345f8f76606786e0c1ccb48b21c changes only version, seek presentation and WebP card branch; routing persistence is source-supported inference, not new native rc18 execution.',
    } : row.id === 'QA-UI-02' ? {
      owner: 'root trusted desktop read-only observation',
      acceptance: ['QA-UI-02'],
      source: { pin, path: 'app.js', functions: [
        { name: 'resetControlsTimer', startLine: 5445 },
        { name: 'setupPlayerChrome.pointerleave', line: 5498 },
      ] },
      smallestDiscriminator: 'Start with hidden controls, move into the bottom entry, then move only to center/outside, wait past320ms and observe controls hidden with no playback action. No click/tap dismissal or synthetic timer substitute.',
      missingEvidence: 'qa/player-input-quality-audit.cjs90–105 uses click dismissal; rc16 native cases use tap dismissal; tests/immersive.test.js40 only checks that hidden reset cannot reveal.',
    } : null,
    confidence: { savedScopedObservation: 'high', wholeRemainingCriterion: row.status === 'passed' ? 'qualified only at original recorded contract scope' : row.status === 'not-applicable' ? 'conditional only' : 'unqualified; no partial-to-whole promotion' },
  };
});
const counts = rows.reduce((m, r) => (m[r.baselineStatus] = (m[r.baselineStatus] || 0) + 1, m), {});
if (rows.length !== 69 || new Set(rows.map(r => r.id)).size !== 69 || originals.size !== 69
  || oldOverlay.size !== 42 || Object.keys(updates).length !== 42
  || rows.some(r => (r.baselineStatus === 'not-run' || r.baselineStatus === 'blocked') && !updates[r.id])
  || counts.passed !== 25 || counts['not-run'] !== 38 || counts.blocked !== 4 || counts['not-applicable'] !== 2)
  throw new Error('Documentary original69/baseline42 identity/count mismatch');
for (const row of rows) for (const key of row.evidenceKeys) if (!owners[key]) throw new Error('Unknown evidence owner');

const manifestPaths = [...new Set([specPath, overlayPath,
  'app.js', 'tests/immersive.test.js',
  'memory/goal/commercial-player-stability.md', 'memory/CANDIDATE-RC17-20260930.md',
  ...Object.entries(owners).filter(([k]) => k !== 'B').flatMap(([, v]) => v.paths)])];
const hashes = Object.fromEntries(manifestPaths.map(file => [file, sha(readPinned(file))]));
const safe = {
  schema: 'drive-original.rc18-original69-documentary-overlay/1',
  evidenceThroughGitCommit: pin,
  fixedPublicCandidate: { source: 'f6749c1a1b1a8345f8f76606786e0c1ccb48b21c', version: '1.22.0-rc.18', worker: '7eb9f9d7-c072-4095-bc94-d6776c69ad4b' },
  state: { goal: 'ACTIVE', automation: 'PAUSED', productionRuntime: 'e08989a', rc19ResultIncluded: false },
  baseline: { path: baselinePath, sha256: baselineHash, fixedSource: baseline.fixedGitSHA, counts },
  preservedRowCount: rows.length, wholeRowPromotions: 0,
  evidenceOwners: owners, rows,
};
const output = (file, value) => fs.writeFileSync(path.join(__dirname, file), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
output('rows.json', safe);
output('provenance.json', {
  schema: 'drive-original.file-only-acceptance-reconciliation/1', pin,
  producerSHA256: sha(fs.readFileSync(__filename)), baselinePath, baselineHash,
  baselineGitTracked: git('ls-files', '--', baselinePath).toString('utf8').trim().length > 0,
  baselineRead: 'Existing local historical ignored report; exact preserved hash required. No private field or response imported.',
  pinnedEvidenceSHA256: hashes,
  original69Unique: true, old42AllMapped: true, originalStatusCountsUnchanged: true,
  originalRequirementAndEvidenceVerbatim: true, wholeRowPromotions: 0,
  noRuntimeVerificationPerformed: true, noTestsNetworkBrowserDeploymentOrPrivateReadbacks: true,
});
const table = rows.map(r => `| ${r.id} | ${r.baselineStatus} | ${r.evidenceKeys.join(', ')} | ${r.disposition} |`).join('\n');
output('README.md', `# rc.18 remaining acceptance — original 69-row overlay

Evidence cutoff: committed **${pin}**. Fixed public candidate:
**f6749c1a1b1a8345f8f76606786e0c1ccb48b21c / 1.22.0-rc.18 /
Worker 7eb9f9d7-c072-4095-bc94-d6776c69ad4b**. Root's ongoing rc.19 work is
excluded. This unit performed file/Git inspection only, with no new tests,
network, browser, private readback, deployment or product/history edits.

**All 69 IDs and baseline statuses are preserved: 25 passed, 38 not-run,
4 blocked, 2 conditional N/A; zero whole-row promotions.** rows.json copies
each baseline requirement/evidence, canonical preserved v3 scenario/expected
result/line, all 42 historical rc.16 outstanding mappings, newer evidence owners,
closed slices, confidence and precise remaining boundaries. Old passing rows
retain their dated contract scope; this is not a claim that all reran on rc.18.
The original rc.13 report is local ignored evidence, not Git-tracked; its exact
SHA is required and bound in provenance.json. The original spec is unchanged.

## Material progress and its limits

Actual rc.17 designated TS 10/50/90/repeated50 seeks now join current target
frames with later paused settlement, hidden loader and trusted close. Native
Q0/Q2 six-seek proof corroborates callback ordering. Actual audio and physical
contexts remain open. Synthetic rc.16 Q2 runs 420 s uninterrupted through
299/360 s to native end/source EOF and settled app/SW close; this proves neither
actual expiry nor the historical 299 s failure's cause.

The rc.16 resource discriminator passes 50 switches/150 seeks and finalizes
170 each of the observed wrappers. Network observer retention explains dominant
measured growth in those trials; explicit five-second reset cadence cannot
establish a normal-runtime native ceiling. No leak patch is justified from this
evidence. The historical cold OtherError1of4 remains unexplained.

rc.18 closes the static WebP card defect with four native cases/three focused
checks while preserving original animation/alpha/bytes. Earlier native large
PNG/BMP, wrong image subtype and wrong filename cases also pass. The separate
supported PNG declared as video/mp4 still selects a video owner and fails.

Exact rc.18 delivery/update proves public52/cache40/private404/cold/offline,
source/package readiness and existing-account update. Active backend before/after
is matched at100%; actual Logpush=false and Tail consumers absent. Collection,
enabled, sampling and persistence remain UNKNOWN because supported observability
readbacks return null/omit the field. Historical rc.16 anonymous12 denials are
retained; they are not a refreshed rc.18 authenticated security matrix or proof
of historical secret absence.

## Prioritized next units

1. **Close existing rc.19 unit:** correctness fences, native frame/settlement/
   cleanup, source/full-suite/delivery and one authorized actual before/after
   causal observation. rc.18's one 13.3749 s seek is not p95; no rc.19 result is
   imported here and no Q1 numeric budget is invented from the initial Q0 budget.
2. **Required product unit20 — QA-FM-08/TR-04:** byte-validated image-owner
   dispatch for the saved PNG/video-MIME counterexample. Reuse canonical reader,
   account/version/original-byte/Range bounds; do not authorize broad fallback
   from metadata alone. Positive signature and HTML/JSON/truncated negative
   controls belong to this same unit, not another all-format suite.
3. **Required finite QA-UI-02 observation:** one trusted desktop bottom→center
   move-only/leave sequence, then actual320ms hide with no playback action.
   Existing audits prove click/tap dismissal, not this automatic-hide clause.
   No defect or code change is inferred.
4. **Actual-account expiry/return:** root can observe natural token expiry,
   later Range/seek and hidden30s return in its owned authenticated context.
   Preserve position/list and record exact source/file version. Do not force
   grant/revocation; native OS return and physical contexts remain separate.
5. **Evidence prerequisites:** corpus sparse facade awaits fileURL permission;
   fresh complete paginated catalog and account/version continuity precede
   max5 remaining ISO +1 WebM +2 metadata-directed unknowns. Neither458 nor
   header1690 is a proven total. Actual Q2/Q3/HDR topology determines conditional
   implementation. Hosted explicit toggles and actual free-plan limits/usage
   require a decisive authenticated read; repeating the null API is not useful.
6. **Genuine remaining gates:** physical iPhone/tab/PWA/Safari/VoiceOver/native
   gestures/fullscreen; two-device foreground sync/refresh; new-client migration;
   authenticated security/history; approved disposable pre-state, write-policy
   and API/web/G: comparison. G6 main/push/production needs separate authority.
   Precise per-row exclusions are in rows.json, not replaced by these summaries.

After rc.19, **unit20 is the only newly identified necessary local product
implementation** in this bounded reconciliation. UI02 has one missing finite
input observation. Corpus-directed Q3/profile work remains conditional on actual
evidence. Do not repeat passing presentation, WebP, long-Q2, keyboard, resource
or anonymous-security suites merely because the whole broader row remains open.
Goal ACTIVE; automation PAUSED; production runtime e08989a unchanged.

## Decisive source pointers

- QA-FM08 canonical spec1719; MEDIA07/spec1007; TR04/spec846.
  qa/rc16-image-format/png-wrong-video-mime-results.json uses supported197-byte
  PNG SHA94910737562283c82b3e555b872fbdb7159e4402ac6573ed4ef5cf5f300a1f81,
  declared video/mp4/disguised.mp4. Saved display fails, viewed=false,
  iframe=null and close settles. app.js openMediaSource7609/7630 and kind dispatch
  7692, initial7706/range7743 routing, plus controls5362/status10277 own the
  metadata-kind boundary. Canonical byte validation/planner dispatch is the
  responsible layer. e57d7b5..f6749c1 app.js
  changes version, seek presentation and WebP cards only: unchanged major-MIME
  routing supports persistence inference, not a newly executed rc.18 failure.
- QA-UI02 canonical spec1761; qa/player-input-quality-audit.cjs90–105 performs
  center CLICK dismissal. qa/rc15-player-ui-qualification/README.md has tap
  dismissal. tests/immersive.test.js40 checks hidden timer no-reveal.
  app.js5445/5498 implements320ms hide/pointerleave; implementation is not
  native input proof. QA-UI05 click-then-Space/button-Space is already explicitly
  tested at qa/player-input-quality-audit.cjs110–125 and is not a new gap.
- QA-FM09 already has native corrupt-EAC3 zero-append/closed decoder proof in
  qa/q2-general-product-integration/README.md; actual corrupt-original labels
  still require independent exact-byte evidence (spec CORPUS07/1086).
- QA-SE02/SL03: qa/rc18-hosted-settings/results.json explicitly records
  observabilityResolved=false and OFFICIAL_READBACK_EXPLICIT_NULL_OR_OMITTED.
  Source intent/platform retention documentation cannot fill actual flags,
  customer plan, effective retention or historical log contents.

## Original 69 status/evidence index

Key owners and exact closed/remaining scopes are in rows.json. Confidence is
high only for the saved limited observations, not unmeasured whole criteria.

| Original ID | Preserved status | Evidence keys | Current disposition |
|---|---|---|---|
${table}

## Reconciliation and curation

node qa/rc18-acceptance-state/reconcile.cjs reads fixed Git/public evidence and
the SHA-bound historical baseline, validates documentary ID/count consistency,
and writes only this leaf. It runs no product test or runtime scenario.
provenance.json binds imported committed records/spec and producer hashes.
No raw private log/token/customer/original data is imported. Root integrates
and commits only the five exact files in curated-savepoint.json. Reproducing
this historical overlay after rc.19 does not refresh runtime claims.
`);
const ownFiles = ['reconcile.cjs', 'README.md', 'rows.json', 'provenance.json', 'curated-savepoint.json'];
output('curated-savepoint.json', {
  schema: 'drive-original.exact-safe-curation/1',
  files: ownFiles.map(file => `qa/rc18-acceptance-state/${file}`),
  excludes: ['all product/version/source files', 'all prior evidence/history', 'private manifests/originals/accounts/tokens/logs'],
  owner: 'root integration and savepoint',
});
console.log(JSON.stringify({ pin, rows: rows.length, outstandingMapped: Object.keys(updates).length, counts, wholeRowPromotions: 0, files: ownFiles.length, runtimeOperations: 0 }));
