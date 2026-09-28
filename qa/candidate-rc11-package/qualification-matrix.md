# rc.11 candidate qualification — reviewed evidence matrix — 2026-09-29 KST

The interrupted reboot draft has been reviewed against the fixed specification,
current goal and scoped evidence owners. All69IDs occur exactly once, with no
missing or extra IDs. `qualification-review.json` records the source-row mapping,
checked pointers and review limits. **WP10 overall remains BLOCKED/PARTIAL; this
matrix review is complete, candidate acceptance and package review are not.**

This is an **evidence matrix with open acceptance gates**. A fixed public static
baseline ZIP was built separately (E14); final release qualification was not
produced. It covers all **69 QA IDs: 60 original +
9 additional** in the fixed v3 specification §§20/22. No requirements are removed.
The goal table and `memory/00-INDEX.md` remain the current evidence owners; this
matrix is a dated package view, not another execution plan.

Candidate identity: source `b9d873926e894bb89a9faa8e638f7f0a80c0eb7e`, app/SW
`1.22.0-rc.11`, Worker `fe556d43-9251-40c7-82bf-d138f35ebccd`.
`driveMutationsEnabled=false`; only canonical own account-state writes are enabled.
Production `v1.21.0/e08989a` and the paused automation are unchanged.

## Interpretation and evidence owners

The status column is **qualification against the individual requirement**,
including only its required environment/format coverage, not a count of passing
unit tests. Deterministic faults against the actual contract owner can satisfy
contract-only rows; they need not be caused on Google's live service. `passed`
contract rows do not pass G5 or the distinct live/device rows. `not-run` means
the full row or its row-specific evidence review has not been completed; the evidence column
retains passing local, historical or current subsets. `blocked` identifies a
known obstacle. A failed discriminator is retained inside its stated scope.
No full row is marked `passed` by extrapolating a subset. A row marked `not-run`
does not invalidate its passing scoped checks or require every injected fault to
be reproduced against Google; its listed environment/route integration remains
unqualified. The source's mandatory actual-device matrix still applies to the
live experience; it does not require malicious provider responses on every
physical device. `not-applicable` covers the unselected B-media and HLS delivery
architectures, with source evidence; full-format/Q2/Q3 goals remain mandatory.

| Key | Evidence owner and exact scope |
|---|---|
| S | Fixed `memory/specs/Drive-Original_Sol-Ultra_Implementation-Pack_v3.0_2026-09-19.md`: QA rows1695–1797; physical matrix1778–1782; G0–G71863–1870; report rules1881–1904. |
| G | `memory/goal/commercial-player-stability.md`: WP/QA ownership table140–167 and dated exits; `memory/00-INDEX.md` owns the record index. |
| E1 | `memory/STATE-NORMAL-20260928.md`, `qa/v2-state-normal-sync/`: product368/368 Node pass; normal actual Chrome sync/readback/reload7docs/6writers,9liked/48unliked/140viewed; own full normalized body expected, other6raw bodies/metadata unchanged, legacy included. Actual cache reload passes; exact whole-app empty-shadow cache9GET/61085bytes passes. Old production code/local-provider9GET/0network/0writes restores full projection. These are distinct scopes. |
| E2 | `memory/CANDIDATE-RC11-20260929.md`, `qa/candidate-rc11-delivery/results.json`: source/Worker identity, public19/cache17 Git-equal bodies, anonymous desktop cold/offline shell and4private404 checks. Five protected recovery envelopes retained/tracked0; never include them in the public package. |
| E3 | `memory/Q1-LIVE-20260928.md`, `qa/q1-live-rc10/`: historical actual rc.10 PC priority Q1 frames,10/50/90% UI seeks/close, one natural credential renewal with continuous sampled progress and post-renewal seek. Not current rc.11 playback, audible output, full-duration/EOF, background return or device proof. |
| E4 | `memory/Q1-CYCLES-20260928.md`, `memory/Q1-RETIREMENT-20260928.md`, `qa/q1-cycles/cycles-50-rc10-results.json`, `qa/q1-auth-cleanup/verification-rc10.json`: historical local actual-app50cycles/150seeks, owner/worker/URL and post-GC DOM/listener checks. Not live private Drive or physical-device endurance. |
| E5 | `memory/PC-POSTREBOOT-20260929.md`, `qa/v2-pc-return-postreboot-rc11/results.json`, `memory/PC-OUTPUT-20260929.md`, `qa/v2-pc-return-rc11/`: pre-reboot Q1/independent PCM AUDIO_RENDERER_ERROR retained, earlier cause unknown. `qa/v2-pc-return-postreboot-rc11/pcm-results.json` records actual click-started0.5s silent PCM ending at800ms/currentTime0.5/errornull, released. Current Q1/normal+5s keyboard seek/resume/close proof is `qa/v2-pc-return-postreboot-rc11/native-before-seek.json`, `qa/v2-pc-return-postreboot-rc11/keyboard-seek-result.json`, `qa/v2-pc-return-postreboot-rc11/close-results.json`: normal playback191.834494s, seek196.834494/ready4, resumed218.128236/645decodedframes/errornull, closed noQ1/src/sink with settled retirement. `qa/v2-pc-return-postreboot-rc11/background-attempt-results.json` is failed REAL_HIDDEN_STATE_NOT_OBSERVED: no hidden event, actual30s return NOTPERFORMED. No audibility/full299s-boundary/expiry/device claim. Pointer reveal paused without overlay; keyboard Tab revealed controls, queued UI observation. No settings/volume changes. |
| E6 | `memory/CORPUS-RC10-20260928.md`: historical36representatives/51bounded media GETs/1002780bytes,15complete bounded TS headers. Final batch comparison failed; historic cause unknown. `memory/CATALOG-DIAGNOSTICS-20260928.md` separately records current rc.11 repeated inventories/comparator124GET/22774540metadata bytes, stable/complete=true,owned media0/writes0. Neither is full-format playback. |
| E7 | `memory/ISO-HEADERS-RC11-20260929.md`, `qa/v2-07a-isobmff-rc11/live-results.json`, `qa/v2-07a-isobmff-rc11/provenance.json`, `qa/v2-07a-isobmff-rc11/README.md`: first actual ISO among36selected,3media GETs/956bytes,126metadata GETs/22775004bytes,stable catalog. Top-level ftyp/moov-before-mdat/header chain complete; tracks/codecs/container validity/decode/playback not proven. One additional static SW proof GET is separately counted. |
| E8 | `memory/DISPOSABLE-20260928.md`, `qa/v2-disposable-live/live-rc10-results.json`, `qa/v2-mutations-integration/`, `tests/mutations.test.js`: actual restricted canonical-controller3new disposable items,35run requests/8writes with independent recovery/final reads; response suppression reconciled without replay. Normal gallery/UI routing, broad target/device/G: matrix remain separate. |
| E9 | `memory/architecture/V2-04A-AUTH-CONTRACT.md`, `memory/Q1-AUTH-20260928.md`, `tests/auth-session.test.mjs`, `tests/cloudflare-auth-worker.test.mjs`, `tests/app.test.js`, `tests/sw.test.js`: local auth/protocol/error/late-owner cases; actual historical PC/iPhone PWA auth observations stay scoped in G. Two-device/multi-instance/OS session acceptance is incomplete. |
| E10 | G WP02/09 exits, `qa/v2-ui-audit.cjs`, `qa/acceptance-audit.cjs`, `tests/acceptance.test.js`, `tests/audit.test.js`: prior local UI/input/status/failed-open/browser-fixture checks. Touch viewport/Windows WebKit are not physical iPhone/VoiceOver proof. D-056(`memory/DECISIONS.md`:323–330) requires pause without forced overlay. |
| E11 | `qa/v2-state-normal-sync/local-results.json`, `qa/v2-state-normal-sync/full-node-results.txt`: existing rc.11 368/368 current-source contract run. Windows Node24.18.0/local VM fixtures, synthetic fileA/size1000 and sparse2/4GiB boundaries (no private file revision). Actual source b9d8739/app+SWrc.11; delivery E2 ties deployed public bytes to this tree. `qualification-review.json` follow-up pins exact test/owner/adapter sources and retained test names. Five supplemental cases actually executed in memory during this review invoke synthetic provider→actual Google adapter→actual credential owner, preserve encrypted refresh state and classify missing fields; results are in that report, no test/product files added. These are contract acceptance, not provider/device fault observations. |
| E12 | S MEDIA-03(954–966) applies when HLS is chosen; `memory/architecture/V2-03C-AUTH-DATA-OWNERSHIP.md`, `memory/Q1-ROUTING-20260927.md`, `media/README.md`, `media/ts-player.mjs`, `app.js`, `scripts/build-pages.cjs`: adopted direct Q0 and bounded TS→MP4 Q1 MSE/ManagedMediaSource worker path; no HLS manifest/segment/hls.js route in the fixed public source. N/A is delivery-specific and must be revisited if HLS is adopted. |
| E13 | `qa/candidate-rc11-package/contract-acceptance-audit.mjs`, `qa/candidate-rc11-package/contract-acceptance-results.json`: new local focused10/10 actual-source cases, one run. Reuses maintained SW/mutation VM helpers without registering/replaying existing tests; synthetic16-byte file exact0–1/open/suffix/last-byte headers/body; literal rerunnable AU08 provider→Google adapter→credential owner five cases; mutation-controller applied PATCH followed by403 readback stays uncertain through recovery with no replay. Producer/source/helper hashes pinned, network/browser/private reads/real mutations0. No physical/device or normal mutation-UI claim. |
| E14 | `qa/candidate-rc11-package/package-results.json`, `qa/candidate-rc11-package/build-static-package.py`: coordinator-built fixed b9d8739 public static baseline ZIP,19entries/.nojekyll,860165bytes/SHA8170e862392a3efcc64334767927754cee89d394ad4cae0e82cb9028b9ba01bc; retained CRC/each-entry Git byte equality/reread checks. This is an evidence/distribution baseline, not full-format/device acceptance, deployed rollback or production approval. This matrix review does not repeat the coordinator's entry checks. |
| E15 | `qa/candidate-contract-completion-rc11/contract-completion.mjs`, `qa/candidate-contract-completion-rc11/results.json`: fixed b9d8739 Git bodies loaded through read-only VM helper facade, independent of concurrent AUTH edits. Focused28/28:23 selected retained actual app/SW tests plus5 new offline-merge/partial-expiry/exact-target/injection/SW-lifecycle discriminators. Every source and producer SHA retained. Synthetic providers/IDs/storage only; real network/browser/private reads/real writes0. Does not replay full368 or qualify physical devices, normal mutation UI, hosted logs or live rollback. |

Current full product368/368 is implementation evidence, not69-row live acceptance.
The actual normal state mutation count was not captured because the Network buffer
was empty/truncated; full independent raw readback is the retained state proof.
The first empty-cache run failed on an owner fence; its cause remains unknown and
its exact failed producer/result is preserved beside the successful second run.
Old-code schema compatibility is not an actual rollback deployment/new OAuth flow.

## Original60 acceptance rows

| QA ID | Required result | Full rc.11 status | Scoped evidence and remaining qualification |
|---|---|---|---|
| QA-TR-01 | Large cold MP4 Q0 before whole download, progress | not-run | G WP06A local faststart proof; current ISO E7 has no playback/track proof. Actual target/device Q0 run remains. |
| QA-TR-02 | Tail-index MP4/MOV without needless whole download | not-run | G local tail-index fixture passes. E7 sampled moov-before-mdat, not tail-index or MOV playback. |
| QA-TR-03 | Same-file10/50/90% video/audio seek and cleanup | not-run | E3 actual rc.10 seeks and E4 local cleanup pass; E5 current rc.11 Q1+normal5s keyboard seek/resume/close pass their scope. Current10/50/90%/audio comparison remains unqualified. |
| QA-TR-04 | 0–1/open/suffix/end ranges have correct bytes/headers | passed | E13 four actual-SW synthetic16-byte cases verify exact0–1/open/suffix/final-byte status206, upstream Range, Content-Range/Length/Accept-Ranges and complete byte equality, one call each. E11 retained contained/hidden range cases extend coverage. This proves the byte contract; actual playback/seek/device gates stay separate. |
| QA-TR-05 | Valid206 accepted; malformed206/416 fail closed | passed | E11 actual SW fixture accepts valid contained/hidden206; wrong/unprovable Content-Range and length fail closed;416 remains structured, and E9/app recovery policy is bounded. Real malformed Google responses are not required to prove this injected contract. No playback/device claim. |
| QA-TR-06 | Upstream200 is represented honestly | passed | E11 actual SW fixture reports original-sequential/status200/no synthetic Accept-Ranges or Content-Range. This is the specified response contract, not actual fallback playback or seek acceptance. |
| QA-TR-07 | 2/4GiB offsets without overflow/full memory allocation | passed | E11 actual SW sparse boundary fixtures preserve exact request/header/body bytes across2/4GiB and maximum-safe offsets; large HEAD/tiny-prefix truncated GET avoid full allocation. G also retains Chrome bridge arithmetic. Full multi-GiB throughput/performance is separate from this numerical/allocation contract. |
| QA-TR-08 | Header/first-byte/body stalls bounded and cancellable | passed | E11 actual SW header/first-byte/body-demand timeout tests classify distinct stages, settle finitely, reject stale timer/byte races and release cancellation; actual app stream recovery has one retry owner and reader callbacks ignoring abort still meet deadlines. Live stalls need not be caused; long actual return remains QA-TR-12. |
| QA-TR-09 | Close/switch/rapid seek cannot commit stale work | passed | E11 actual app source/session clearing, newer seek/event/frame/timer fences and stale native-fallback tests, plus source-owner postflight/abort fences cover all stale-commit clauses. E4 historical cycles and E5 current actual close add integration scope; no total-native-memory/device endurance claim. |
| QA-TR-10 | Changed source cannot mix cached bytes | not-run | Local content/source fences pass; retained current-source change/recovery cases need row-specific mapping. Do not modify original Drive media to create a fault; controlled version-change fixtures can prove the contract. |
| QA-TR-11 | Cache/quota failure is not a codec verdict | passed | E11 exact QA-TR-11 actual-app tests inject policy limits, native Blob allocation and mid-write OPFS quota failure: storage-limited, no automatic compatibility/codec verdict, cleaned lease, stale failures fenced. This classification contract does not require filling a physical device's storage. |
| QA-TR-12 | Long actual playback survives expiry, seek and return | blocked | E3 one actual rc.10 natural-renewal boundary passes; E5 current rc.11 Q1/seek/resume/close subset passes. Tool attempts did not establish an actual hidden document, so30s return was not performed; the failed observer is retained. Sleep/wake/hour/device and historic299s boundary remain. |
| QA-FM-01 | All11extensions/codec combinations inventoried/routed | not-run | E6 inventory/byte/TS and E7 first ISO headers only. Full tracks/Q-route/decode/device inventory unaccepted. |
| QA-FM-02 | Unsupported container uses Q1 without video re-encode | not-run | E3 historical actual priority/local preservation and E5 current rc.11 priority Q1 progress/5s seek/close pass their scopes. Audible output, preservation of all selected tracks and broader combination qualification remain. |
| QA-FM-03 | Q2 fixes incompatible audio without video re-encode | not-run | No actual Q2 acceptance; PCM output discriminator is not Q2 or source AAC evidence. |
| QA-FM-04 | Unsupported video codec has approved actual Q3 path | not-run | Native comparison/local spikes do not satisfy app acceptance; supported resource/path proof remains. |
| QA-FM-05 | Multi-audio/silent/subtitle/rotation/VFR timing | not-run | Selected TS local preservation only; full track variants/device selection/timing remain. E7 parses no tracks. |
| QA-FM-06 | Existing HDR/high-depth preservation/transform labeled | not-run | Actual HDR existence/paths not qualified; cannot infer not-applicable from unexamined corpus. |
| QA-FM-07 | GIF/WebP list static, viewer animation/alpha/timing | not-run | Prior local static GIF/list cases; actual viewer WebP/animation/device matrix remains. E6 signature counts are not viewer proof. |
| QA-FM-08 | Large images/wrong MIME displayed safely without omissions | not-run | Prior local image/GIF/error cases; bounded signatures E6 do not prove full large-image/MIME/device behavior. |
| QA-FM-09 | Damaged/incomplete media is bounded/classified | not-run | Local malformed/range cases pass; actual corruption/format matrix remains. E5 is not corruption proof. |
| QA-FM-10 | Derived HLS90% seeks directly on correct timeline | not-applicable | E12/S MEDIA-03 condition: HLS delivery is not selected or implemented in this fixed candidate; Q1 uses MP4 fragments through MSE, not a playlist/segment route. Reopen on HLS adoption. Actual arbitrary seek and full-format goals remain in QA-TR-03/12 and QA-FM-01~09. |
| QA-AU-01 | Real expiry recovery preserves list/position | not-run | E3 one rc.10 natural renewal/seek and E9 local cases pass; actual rc.11/device expiry matrix remains. |
| QA-AU-02 | Concurrent401 has one bounded account refresh | passed | E11 twenty callers across two actual credential owners share one persisted refresh/revision; page requests and failed waiters are single-flight; SW401 replay is once/newer-revision-only, failed refresh never replays rejected token. Contract concurrency is qualified; real two-device/serverless coordination remains QA-SL-02. |
| QA-AU-03 | Late401/same-token newer revision cannot delete credential | passed | E11 current actual app/SW tests cover late401/newer revision with identical token text, one newer replay, stale/conflicting revisions and late CLEAR_TOKEN; E9 owns atomic retained credentials. This race contract is discriminated by fixtures; real two-device refresh is still QA-SL-02. |
| QA-AU-04 | Real/virtual account switch isolates files/write/state | passed | S explicitly allows real/virtual selection. E11 actual-app tests fence old HTTP/JSON/catalog/credential completions and state writes; wrong-account credential cannot replace account/list state; submitted mutation stays with origin account and recovery cannot read/replay it under new account. This is the virtual-account acceptance branch, not a real-account/device switch claim. |
| QA-AU-05 | Scope/permission/quota/network differentiated, no needless logout | not-run | E11 permission/rate-limit reasons/timing, storage-quota and bounded network credential preservation pass. Missing granted scope rejects, but S AUTH-05(734–746) also requires feature-only restriction/explicit reconsent while possible reads/playback remain. Current `worker/google.mjs` maps scope shortage to generic auth_unavailable/google_token_payload_invalid; that specific continuation/reconsent clause is not yet qualified. Resolve with an actual-source synthetic partial-scope fixture/source review, not a real Google grant downgrade. |
| QA-AU-06 | Third-party cookies blocked still permits app path | not-run | Direct-reader/B-auth architecture removes iframe dependency; actual blocked-cookie/platform scenario remains. |
| QA-AU-07 | Cancel/missing callback/state error fails once, preserves data | passed | E11 actual app blocked/cancelled popup and missing-callback deadline preserve usable session and release action; callback error is consumed once; wrong/expired pre-auth state is terminal and callback failures use one allowlisted retry root. Stale completion cannot revive an expired attempt. Physical callback-context acceptance remains QA-SL-05. |
| QA-AU-08 | Partial refresh response preserves prior refresh token | passed | E11 retained missing-refresh-field test plus E13 literal maintained five-case actual Google-adapter→account-owner fixture: valid omitted refresh retains encrypted credential; missing access/expiry/type and empty refresh reject once with auth_unavailable, preserving old refresh state. No live provider fault is needed; real expiry/revocation is QA-AU-01/QA-SL-01. |
| QA-AU-09 | Broker restart/session recovery or clear reconnect | passed | E11 restarted actual credential owner uses persisted lease/session state, recovers once and rejects late old revision; actual SQLite host adapter commits/rolls back; SW restart gets only its correlated client credential; initial session recovery/failed credential probe remains bounded with explicit reconnect. Qualified deterministic owner-restart contract, not a live host outage/device sleep-wake assertion. |
| QA-AU-10 | New origin/client preserves state/tombstones/writer identity | not-run | E1 actual same-account legacy inclusion, own-writer sync, protected backups and empty-shadow/old-code read pass. New-origin OAuth/client binding/device migration not proven. |
| QA-ST-01 | Two foreground devices exchange likes/unlikes/viewed automatically | not-run | E1 maintained two-writer/provider convergence and desktop sync pass; two physical devices are unaccepted. |
| QA-ST-02 | Offline edits leave remote unchanged then safely merge | passed | E15 fixed actual app+synthetic transport: offline like/unlike/viewed edits survive failed transport with remote writes0; reconnect confirms merged concurrent writer, viewed union and unlike tombstone in own document, other writer unchanged. Contract acceptance; actual two-device experience remains QA-ST-01/G5. |
| QA-ST-03 | Failed open is not recorded as successful viewing | passed | E11 actual app viewed owner requires presentation progress, rejects failed/hidden/stale/account-switched videos and broken/replaced/rejected-decoding images; open/paused frame/seek alone do not record success. Generations cannot combine observations; retry cannot double-record. STATE-07 policy is tested without rewriting historical viewed data. |
| QA-MU-01 | Disposable trash has independent same-ID remote confirmation | blocked | E8 restricted controller actual pass. Normal candidate UI intentionally blocked by general writes=false. |
| QA-MU-02 | Disposable folder move confirms actual parents | blocked | E8 restricted controller actual pass; normal UI/gallery target qualification remains locked. |
| QA-MU-03 | Lost response reconciles remote commit without duplicates | passed | E11 actual ordinary-file trash/move controller fixtures confirm applied-before-loss by independent GET with one PATCH; uncertain-before-apply remains read-only through repeat/reload. E8 separately retains actual restricted controller response suppression/readback without replay. This row's reconciliation contract passes; normal gallery/UI delivery is still unqualified in QA-MU-01/02/10. AppData CREATE is not substituted for file-operation proof. |
| QA-MU-04 | Pre-dispatch failure leaves remote unchanged and reports honestly | passed | E11 actual canonical controller rejects storage/lock failure, stale snapshot, wrong ID/parents and denied capabilities before PATCH; retained zero-PATCH assertions and propagated refusal prove unchanged synthetic remote state/no success. General candidate UI remains locked/unqualified in QA-MU-01/02; no real write claim from these fixtures. |
| QA-MU-05 | Partial success+expiry/account switch retains per-file results | passed | E15 actual canonical controller+synthetic provider proves partial batch expiry and account-switch cases: per-file fulfilled/rejected and origin confirmed/uncertain ledgers preserved, remaining items fenced, new-account recovery writes0. E8 retains separate actual restricted integration; normal gallery write route stays locked. |
| QA-MU-06 | Duplicate operationId/different payload resolves or conflicts | passed | E11 actual mutation ledger binds operationId to payload, conflicts on different intent, retains confirmed proof and never replays the same ID after external restore; persistent/reload uncertainty also never transparently resubmits. Stable appData CREATE IDs are not used as this row's proof. Normal UI remains separate. |
| QA-MU-07 | Same name/shortcut/shared-drive intent changes only right ID | passed | E15 fixed canonical controller moves selected same-name shared-drive shortcut ID only, supportsAllDrives=true, verified old/destination parents, one PATCH confirmed by independent GET; sibling and shortcut target unchanged. Retained shortcut fixture separately passes. Normal gallery target discovery/device experience is not implied. |
| QA-MU-08 | Readback404/permission loss is not guessed deletion | passed | E11 actual ordinary-file controller repeated404/unreadable readback stays uncertain with after=null/no replay. E13 applied PATCH then403 independent readback stays uncertain through recovery, one PATCH only. Both required refusal branches are proven without guessing deletion; actual mutation UI remains separate. |
| QA-MU-09 | API/web/G: comparison separates cloud state from sync delay | not-run | Restricted API readback alone is not web/G: comparison. |
| QA-MU-10 | Disposable pre-state restored, no permanent deletion | not-run | E8 actual restricted restoration/read-only recovery preserves identities and uses no permanent DELETE, but final file is recoverably trashed and2new folders retained. No exact approved pre-state restoration comparison for all remnants is recorded. Securely inspect recovery ledger/pre-state before any further cleanup; general writes remain false. |
| QA-UI-01 | Playback states do not themselves reveal chrome | not-run | E10 local contract; D-056 pause-without-overlay retained. New overlay/cursor work is QUEUED, not a performed rc.11 audit. |
| QA-UI-02 | PC center hidden/bottom reveal/leave hide | not-run | Prior local UI evidence E10; new cursor behavior QUEUED/unstarted, actual rc.11 audit remains. |
| QA-UI-03 | Mobile bottom controls/reveal/dismiss usable | not-run | Overlay-only touch failure user-reported; A-010 QUEUED for hit-test reproduction. Pause must not force overlay; physical acceptance remains. |
| QA-UI-04 | Fallback/error/external actions have one dismissible owner | not-run | E10 implemented/local owner checks pass; actual fallback/device matrix remains. |
| QA-UI-05 | Click then Space/Tab-button Space have correct single action | not-run | E10 local keyboard fixtures pass; full actual focus/platform behavior remains. |
| QA-UI-06 | VoiceOver/keyboard can explicitly reveal without traps | not-run | Local keyboard/focus only; physical VoiceOver acceptance missing. |
| QA-UI-07 | Long-press/move/multi-touch safely cancel or complete | not-run | E10 synthetic input cases; physical gesture/OS matrix remains. |
| QA-UI-08 | Edge/interior/cancel/re-entry have single input owner | not-run | E10 local transition/generation cases; physical navigation matrix remains. |
| QA-UI-09 | Rotation/fullscreen/safe-area preserve close/seek | not-run | Viewport/native fixtures are not actual iPhone fullscreen/OS acceptance. |
| QA-UI-10 | Normal sync/preparation has no persistent noisy UI | not-run | E10 local quiet/status ownership; E1 no normal423/pending error at retained reload. New loading/general polish QUEUED/unstarted; full UI/device audit remains. |
| QA-LF-01 | 50switch/seek/close has no accumulating jobs/owners/buffers | not-run | E4 historical local50cycles/150seeks pass with retained failed sample. Current actual rc.11 output/device/resource endurance not qualified. |
| QA-SE-01 | Foreign IDs/accounts/path/URL injection denied | passed | E15 injected path/URL IDs400/provider0; arbitrary unauthorized ID preserves synthetic provider403/no-store; actual client-scoped credential/missing-owner and foreign canonical-state capability fixtures reject outside owner. E2 current public private404/E9 retained auth routes corroborate integration. No claim of probing another real account. |
| QA-SE-02 | Logs/public build/process args expose no credentials/media | not-run | E15 actual media trace emits no token/header/resourceKey; E2/E14 fixed public allowlist excludes private evidence/internal files. Current hosted auth/app logs and credential-handling process invocation producers are not audited by this unit; inspect those exact owners before whole-row pass. |
| QA-SE-03 | Malformed/storage-full failures preserve originals/other cache | passed | E15 malformed Range/truncated or oversized206 fail closed before unverified bytes; actual app codec/recovery and Blob/OPFS-quota fixtures report bounded/storage-limited failure and release owned lease/reader; state quota writes0 preserves local/remote data; cache reset preserves sibling cache/worker. Originals use synthetic read-only bytes, no remote media mutation. Actual OS endurance remains separate. |
| QA-SW-01 | Old/new shell/worker/offline safely update with public-only cache | passed | E15 actual old-page capability/restarted-worker correlation fences and install/activate pass: old owned cache removed, current/sibling retained; old-version query offline reload uses canonical cached shell; public-only install and API/media/sibling cache exclusion. E2 actual candidate cold/offline/public-cache proof supplies integration. Mandatory installed physical-device experience remains separate. |

## Additional9 rows — do not replace the original60

| QA ID | Required result | Full rc.11 status | Scoped evidence and remaining qualification |
|---|---|---|---|
| QA-RP-01 | Same designated file/version across PC/iPhone tabs/PWA/Safari | blocked | E3 historical PC priority and E5 post-reboot PCM only; required exact cross-device/version playback comparison remains unavailable/unaccepted. No iframe/native external pass substitution. |
| QA-SL-01 | Session/access-token lifetimes separated; actual recovery | not-run | E3 real renewal boundary, E1 actual reload, E9 local lifetime cases. Full actual expiry/revocation/reconnect/device matrix remains. |
| QA-SL-02 | Two-device/multi-instance refresh safe, revisions atomic | not-run | Auth single-flight/revision fixtures pass; actual two-device/serverless multi-instance proof remains. |
| QA-SL-03 | Short reader credential enforces session/Origin/CSRF/account/privacy | not-run | E9 local security/memory/no-store contracts and E2 delivery checks; full live negative authorization/retention matrix remains. |
| QA-SL-04 | Free-plan limits/cost/CPU/storage/exhaustion bounded | not-run | Adopted no-card/free architecture and local quota failures; actual operation/load/exhaustion evidence insufficient for full acceptance. |
| QA-SL-05 | iPhone tab/PWA OAuth callback returns to correct context | not-run | G historical user-confirmed physical PWA auth return/list/relaunch; Chrome tab/PWA/Safari context matrix incomplete. Same-origin does not prove shared cookies. |
| QA-SL-06 | Selected B-media relay streaming/Range/cancel contract | not-applicable | D-051/E9 adopt B-auth plus direct Drive bytes; no B-media relay selected. This does not waive Q2/Q3 or format goals. |
| QA-SL-07 | Candidate/new client preserves old appData and recovery | not-run | E1 same-account raw union/legacy/writer/backup/read compatibility pass; new client/origin OAuth relationship and full device migration remain unknown. |
| QA-SL-08 | Unauthorized candidate APIs/files/diagnostics denied; old production unchanged | not-run | E2 public private404/source isolation and unchanged production record pass; broad actual account authorization/diagnostic matrix and future production release remain separate. |

## G0–G7 boundaries and next discriminators

- **G0 scoped basis confirmed:** canonical repo, branch, source/Worker identity,
  D-050 authority and protected data boundaries are recorded. Review began at
  clean documentation HEAD `e31711288b040c459d85ec9a91176c590bba4198`; this is
  distinct from the deployed source SHA above.
- **G1/G2 scoped evidence retained:** the same-source transport/container
  discriminator and adopted B-auth/direct-data responsibility split are owned
  by G/D-051. This review does not repeat architecture adoption or qualify
  untested load/cost, formats or device branches.

- **G3 scoped implementation:** current product368Node checks and scoped independent
  review pass. **G4 overall integration remains partial:** local browser/cleanup,
  one prior actual Q1 slice and current state/corpus/header evidence do not cover
  the full format/resource/input/environment matrix.
- **G5 incomplete:** real Google state and restricted disposable readback exist;
  required physical/two-device/offline/new-origin and broad playback conditions
  are unaccepted. Post-reboot generated PCM progress resolves the reproduced
  common-output failure for that silent sample; current Q1 progresses/seeks/closes.
  Actual30s return is blocked by no observed hidden state, not an audio failure.
  Preserve the pre-reboot failure; its lower cause remains
  unknown. No volume/output settings,
  permissions, driver/service/browser changes or transcoding are authorized by
  packaging this evidence.
- **G6 unapproved/unperformed:** candidate deployment proof E2 is not main merge,
  push or production replacement approval. Production serving smoke after an
  approved release has not occurred. E14's separately built static ZIP is a
  baseline only; do not label it production-ready from this matrix.
- **G7 package handoff is bounded:** this matrix exposes every QA row, provenance,
  failed/unknown observations and rollback limits. Root still owns package
  full package/source/evidence review and remaining §22.3 final report fields;
  E14's static allowlist/blob checks pass their narrower scope. Exclude tokens,
  private recovery envelopes, IDs/names, original media and private screenshots.

Small next discriminators remain with their owners: WP07 must parse actual tracks/
codec/index before any ISO playback support claim; WP06 needs an actual hidden
document transition before a real30s return; WP08 needs approved live two-device/offline
propagation; WP05 needs a separately secured normal-UI disposable run rather than
global write unlocking; WP09 needs the actual physical matrix. Cursor/overlay/
loading/general UI requests remain **QUEUED/unstarted after current core work**,
not overriding dependencies. D-056 pause-without-overlay stays binding.

Restore using the recorded known source/public tree and independent schema/read
checks, never a force reset or automatic undo of remote state. Keep existing
legacy/writers and five private recovery envelopes. Old-code/local-provider
compatibility E1 supports preparation; live rollback behavior is still unaccepted.
