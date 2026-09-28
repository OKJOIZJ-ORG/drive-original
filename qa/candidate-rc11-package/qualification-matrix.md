> REBOOT CHECKPOINT DRAFT — 작업 종료 지시로 WP-10 최종 검토 전에 보존한 초안입니다. 인수 완료나 배포 승인 증거로 사용하지 마세요. 재개 후 행별 근거를 다시 확인합니다.

# DRAFT — rc.11 candidate qualification — 2026-09-29 KST

Draft preserved for reboot at the user's stop boundary. It contains all69QA rows,
but final source-pointer/coverage verification and root/package review have not
been completed. **WP10 is not done or ready.** Do not use this draft as release
qualification or approval. No further WP10 work continues in this session.

This is an **unfinished evidence matrix with open acceptance gates**. No candidate
package or final release qualification was produced. It covers all **69 QA IDs: 60 original +
9 additional** in the fixed v3 specification §§20/22. No requirements are removed.
The goal table and `memory/00-INDEX.md` remain the current evidence owners; this
matrix is a dated package view, not another execution plan.

Candidate identity: source `b9d873926e894bb89a9faa8e638f7f0a80c0eb7e`, app/SW
`1.22.0-rc.11`, Worker `fe556d43-9251-40c7-82bf-d138f35ebccd`.
`driveMutationsEnabled=false`; only canonical own account-state writes are enabled.
Production `v1.21.0/e08989a` and the paused automation are unchanged.

## Interpretation and evidence owners

The status column is **full current-candidate row qualification**, including its
outstanding required environment/format coverage, not a count of passing unit
tests. `not-run` means the full row has not been completed; the evidence column
retains passing local, historical or current subsets. `blocked` identifies a
known obstacle. A failed discriminator is retained inside its stated scope.
No full row is marked `passed` by extrapolating a subset. The sole
`not-applicable` row is the unselected B-media relay architecture.

| Key | Evidence owner and exact scope |
|---|---|
| S | Fixed `memory/specs/Drive-Original_Sol-Ultra_Implementation-Pack_v3.0_2026-09-19.md`: QA rows1695–1797; physical matrix1778–1782; G0–G71863–1870; report rules1881–1904. |
| G | `memory/goal/commercial-player-stability.md`: WP/QA ownership table140–167 and dated exits; `memory/00-INDEX.md` owns the record index. |
| E1 | `memory/STATE-NORMAL-20260928.md`, `qa/v2-state-normal-sync/`: product368/368 Node pass; normal actual Chrome sync/readback/reload7docs/6writers,9liked/48unliked/140viewed; own full normalized body expected, other6raw bodies/metadata unchanged, legacy included. Actual cache reload passes; exact whole-app empty-shadow cache9GET/61085bytes passes. Old production code/local-provider9GET/0network/0writes restores full projection. These are distinct scopes. |
| E2 | `memory/CANDIDATE-RC11-20260929.md`, `qa/candidate-rc11-delivery/results.json`: source/Worker identity, public19/cache17 Git-equal bodies, anonymous desktop cold/offline shell and4private404 checks. Five protected recovery envelopes retained/tracked0; never include them in the public package. |
| E3 | `memory/Q1-LIVE-20260928.md`, `qa/q1-live-rc10/`: historical actual rc.10 PC priority Q1 frames,10/50/90% UI seeks/close, one natural credential renewal with continuous sampled progress and post-renewal seek. Not current rc.11 playback, audible output, full-duration/EOF, background return or device proof. |
| E4 | `memory/Q1-CYCLES-20260928.md`, `memory/Q1-RETIREMENT-20260928.md`, `qa/q1-product/`, `qa/q1-lifecycle/`: historical local actual-app50cycles/150seeks, owner/worker/URL and post-GC DOM/listener checks. Not live private Drive or physical-device endurance. |
| E5 | `memory/PC-OUTPUT-20260929.md`, `qa/v2-pc-return-rc11/`: current Q1 has4decoded frames then AUDIO_RENDERER_ERROR; independent generated PCM fails under actual click. Windows active/default endpoints exist; lower audio stage/driver cause unknown. Planned30s background→foreground was not performed. No settings/volume changes. |
| E6 | `memory/CORPUS-RC10-20260928.md`: historical36representatives/51bounded media GETs/1002780bytes,15complete bounded TS headers. Final batch comparison failed; historic cause unknown. `memory/CATALOG-DIAGNOSTICS-20260928.md` separately records current rc.11 repeated inventories/comparator124GET/22774540metadata bytes, stable/complete=true,owned media0/writes0. Neither is full-format playback. |
| E7 | `qa/v2-07a-isobmff-rc11/live-results.json`, `provenance.json`, `README.md`: first actual ISO among36selected,3media GETs/956bytes,126metadata GETs/22775004bytes,stable catalog. Top-level ftyp/moov-before-mdat/header chain complete; tracks/codecs/container validity/decode/playback not proven. One additional static SW proof GET is separately counted. |
| E8 | `memory/DISPOSABLE-20260928.md`, `qa/v2-mutations-integration/`, `tests/mutations.test.js`: actual restricted canonical-controller3new disposable items,35run requests/8writes with independent recovery/final reads; response suppression reconciled without replay. Normal gallery/UI routing, broad target/device/G: matrix remain separate. |
| E9 | `memory/architecture/V2-04A-AUTH-CONTRACT.md`, `memory/Q1-AUTH-20260928.md`, `tests/auth.test.js`, `tests/app.test.js`, `tests/sw.test.js`: local auth/protocol/error/late-owner cases; actual historical PC/iPhone PWA auth observations stay scoped in G. Two-device/multi-instance/OS session acceptance is incomplete. |
| E10 | G WP02/09 exits, `qa/v2-ui-audit.cjs`, `qa/acceptance-audit.cjs`, `tests/acceptance.test.js`, `tests/audit.test.js`: prior local UI/input/status/failed-open/browser-fixture checks. Touch viewport/Windows WebKit are not physical iPhone/VoiceOver proof. D-056(`memory/DECISIONS.md`:323–330) requires pause without forced overlay. |

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
| QA-TR-03 | Same-file10/50/90% video/audio seek and cleanup | blocked | E3 actual rc.10 seeks and E4 local cleanup pass; current audio output E5 blocks a complete rc.11 playback/audio comparison. |
| QA-TR-04 | 0–1/open/suffix/end ranges have correct bytes/headers | not-run | G/tests/sw local edge contracts pass; E6 bounded206 subset. Full actual file/device range matrix remains. |
| QA-TR-05 | Valid206 accepted; malformed206/416 fail closed | not-run | Local SW/product fixtures pass. Actual malformed/416 environment coverage remains. |
| QA-TR-06 | Upstream200 is represented honestly | not-run | Local SW fixtures pass; full actual source/device case not recorded. |
| QA-TR-07 | 2/4GiB offsets without overflow/full memory allocation | not-run | G sparse local+Chrome bridge arithmetic passes; not actual multi-GiB transfer/performance. |
| QA-TR-08 | Header/first-byte/body stalls bounded and cancellable | not-run | G/E9 local watchdog/fault ownership passes; complete actual fault/device matrix remains. |
| QA-TR-09 | Close/switch/rapid seek cannot commit stale work | not-run | E4 local retirement/cycles and E3 historical actual close pass; current full environment matrix remains. |
| QA-TR-10 | Changed source cannot mix cached bytes | not-run | Local content/source fences pass; actual source-change recovery across required devices remains. |
| QA-TR-11 | Cache/quota failure is not a codec verdict | not-run | G QA-TR-11 local quota/OPFS/Blob cases pass; actual device storage-limit case remains. |
| QA-TR-12 | Long actual playback survives expiry, seek and return | blocked | E3 one actual rc.10 natural-renewal boundary passes. E5 prevented stable rc.11 playback;30s return not attempted; sleep/wake/hour/device coverage remains. |
| QA-FM-01 | All11extensions/codec combinations inventoried/routed | not-run | E6 inventory/byte/TS and E7 first ISO headers only. Full tracks/Q-route/decode/device inventory unaccepted. |
| QA-FM-02 | Unsupported container uses Q1 without video re-encode | blocked | E3 historical actual priority and local preservation pass. Current E5 output prevents full video/audio qualification; broader combinations remain. |
| QA-FM-03 | Q2 fixes incompatible audio without video re-encode | not-run | No actual Q2 acceptance; PCM output discriminator is not Q2 or source AAC evidence. |
| QA-FM-04 | Unsupported video codec has approved actual Q3 path | not-run | Native comparison/local spikes do not satisfy app acceptance; supported resource/path proof remains. |
| QA-FM-05 | Multi-audio/silent/subtitle/rotation/VFR timing | not-run | Selected TS local preservation only; full track variants/device selection/timing remain. E7 parses no tracks. |
| QA-FM-06 | Existing HDR/high-depth preservation/transform labeled | not-run | Actual HDR existence/paths not qualified; cannot infer not-applicable from unexamined corpus. |
| QA-FM-07 | GIF/WebP list static, viewer animation/alpha/timing | not-run | Prior local static GIF/list cases; actual viewer WebP/animation/device matrix remains. E6 signature counts are not viewer proof. |
| QA-FM-08 | Large images/wrong MIME displayed safely without omissions | not-run | Prior local image/GIF/error cases; bounded signatures E6 do not prove full large-image/MIME/device behavior. |
| QA-FM-09 | Damaged/incomplete media is bounded/classified | not-run | Local malformed/range cases pass; actual corruption/format matrix remains. E5 is not corruption proof. |
| QA-FM-10 | Derived HLS90% seeks directly on correct timeline | not-run | No accepted HLS scenario. Q1 MSE seek evidence is not HLS and does not waive the row. |
| QA-AU-01 | Real expiry recovery preserves list/position | not-run | E3 one rc.10 natural renewal/seek and E9 local cases pass; actual rc.11/device expiry matrix remains. |
| QA-AU-02 | Concurrent401 has one bounded account refresh | not-run | E9 local concurrency passes; real multi-device/multi-instance acceptance remains. |
| QA-AU-03 | Late401/same-token newer revision cannot delete credential | not-run | E9 local revision/lease cases pass; full required live environment coverage remains. |
| QA-AU-04 | Real/virtual account switch isolates files/write/state | not-run | E1/E9 virtual account+abort/foreign-write tests pass; actual account/device switch qualification remains. |
| QA-AU-05 | Scope/permission/quota/network differentiated, no needless logout | not-run | Local errors pass; E1 malformed state/write gates and prior real errors are scoped; complete live error matrix remains. |
| QA-AU-06 | Third-party cookies blocked still permits app path | not-run | Direct-reader/B-auth architecture removes iframe dependency; actual blocked-cookie/platform scenario remains. |
| QA-AU-07 | Cancel/missing callback/state error fails once, preserves data | not-run | E9 local popup/callback failures and historical auth observations; full physical execution-context matrix remains. |
| QA-AU-08 | Partial refresh response preserves prior refresh token | not-run | Auth-owner retention fixtures pass; actual provider partial-response case not recorded. |
| QA-AU-09 | Broker restart/session recovery or clear reconnect | not-run | E9 synthetic restart/session and actual normal reload E1; actual broker-restart/device case remains. |
| QA-AU-10 | New origin/client preserves state/tombstones/writer identity | not-run | E1 actual same-account legacy inclusion, own-writer sync, protected backups and empty-shadow/old-code read pass. New-origin OAuth/client binding/device migration not proven. |
| QA-ST-01 | Two foreground devices exchange likes/unlikes/viewed automatically | not-run | E1 maintained two-writer/provider convergence and desktop sync pass; two physical devices are unaccepted. |
| QA-ST-02 | Offline edits leave remote unchanged then safely merge | not-run | E1 local pending/merge fixtures; actual offline-to-online propagation unaccepted. |
| QA-ST-03 | Failed open is not recorded as successful viewing | not-run | E10 local STATE-07 presentation/start timing passes; complete actual format/device failed-open case remains. Four decoded E5 frames alone are not success. |
| QA-MU-01 | Disposable trash has independent same-ID remote confirmation | blocked | E8 restricted controller actual pass. Normal candidate UI intentionally blocked by general writes=false. |
| QA-MU-02 | Disposable folder move confirms actual parents | blocked | E8 restricted controller actual pass; normal UI/gallery target qualification remains locked. |
| QA-MU-03 | Lost response reconciles remote commit without duplicates | not-run | E8 actual suppressed response and E1 synthetic stable-ID appData CREATE pass; full normal file-operation scenario remains. |
| QA-MU-04 | Pre-dispatch failure leaves remote unchanged and reports honestly | not-run | E8 local controller/E1 actual-app fixture cases pass; full normal UI/live matrix remains. |
| QA-MU-05 | Partial success+expiry/account switch retains per-file results | not-run | E8 local ledger/account fences pass; actual partial live batch/device case remains. |
| QA-MU-06 | Duplicate operationId/different payload resolves or conflicts | not-run | E8 local ledger fixtures pass; normal live UI scenario not recorded. Stable state-file ID is a different contract. |
| QA-MU-07 | Same name/shortcut/shared-drive intent changes only right ID | not-run | Local target/capability tests; E8 allowlisted3new targets do not cover all target classes. |
| QA-MU-08 | Readback404/permission loss is not guessed deletion | not-run | E8 local refusal and E1 writer404 fail-closed cases pass; actual ordinary-file UI case remains. |
| QA-MU-09 | API/web/G: comparison separates cloud state from sync delay | not-run | Restricted API readback alone is not web/G: comparison. |
| QA-MU-10 | Disposable pre-state restored, no permanent deletion | not-run | E8 actual restricted restore/stable final reads pass; full normal-UI residual-data/recovery matrix remains. |
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
| QA-SE-01 | Foreign IDs/accounts/path/URL injection denied | not-run | E1/E9 local capability and adapter negative tests pass; E2 public private404 subset. Full live authorization matrix remains. |
| QA-SE-02 | Logs/public build/process args expose no credentials/media | not-run | E2 allowlist/public404/protected tracked0 and redacted reports pass. Full production/process/log scope is not claimed; private evidence excluded from package. |
| QA-SE-03 | Malformed/storage-full failures preserve originals/other cache | not-run | E1/E10/local quota/cache isolation pass; actual OS/device failure matrix remains. |
| QA-SW-01 | Old/new shell/worker/offline safely update with public-only cache | not-run | E2 current public19/cache17/cold/offline pass; local version/protocol fences and E7 active rc.11 proof. Full installed-device update matrix remains. |

## Additional9 rows — do not replace the original60

| QA ID | Required result | Full rc.11 status | Scoped evidence and remaining qualification |
|---|---|---|---|
| QA-RP-01 | Same designated file/version across PC/iPhone tabs/PWA/Safari | blocked | E3 historical PC priority and E5 current output failure; exact cross-device/version comparison unaccepted. No iframe/native external pass substitution. |
| QA-SL-01 | Session/access-token lifetimes separated; actual recovery | not-run | E3 real renewal boundary, E1 actual reload, E9 local lifetime cases. Full actual expiry/revocation/reconnect/device matrix remains. |
| QA-SL-02 | Two-device/multi-instance refresh safe, revisions atomic | not-run | Auth single-flight/revision fixtures pass; actual two-device/serverless multi-instance proof remains. |
| QA-SL-03 | Short reader credential enforces session/Origin/CSRF/account/privacy | not-run | E9 local security/memory/no-store contracts and E2 delivery checks; full live negative authorization/retention matrix remains. |
| QA-SL-04 | Free-plan limits/cost/CPU/storage/exhaustion bounded | not-run | Adopted no-card/free architecture and local quota failures; actual operation/load/exhaustion evidence insufficient for full acceptance. |
| QA-SL-05 | iPhone tab/PWA OAuth callback returns to correct context | not-run | G historical user-confirmed physical PWA auth return/list/relaunch; Chrome tab/PWA/Safari context matrix incomplete. Same-origin does not prove shared cookies. |
| QA-SL-06 | Selected B-media relay streaming/Range/cancel contract | not-applicable | D-051/E9 adopt B-auth plus direct Drive bytes; no B-media relay selected. This does not waive Q2/Q3 or format goals. |
| QA-SL-07 | Candidate/new client preserves old appData and recovery | not-run | E1 same-account raw union/legacy/writer/backup/read compatibility pass; new client/origin OAuth relationship and full device migration remain unknown. |
| QA-SL-08 | Unauthorized candidate APIs/files/diagnostics denied; old production unchanged | not-run | E2 public private404/source isolation and unchanged production record pass; broad actual account authorization/diagnostic matrix and future production release remain separate. |

## G5/G6/G7 boundaries and next discriminators

- **G3 scoped implementation:** current product368Node checks and scoped independent
  review pass. **G4 overall integration remains partial:** local browser/cleanup,
  one prior actual Q1 slice and current state/corpus/header evidence do not cover
  the full format/resource/input/environment matrix.
- **G5 incomplete:** real Google state and restricted disposable readback exist;
  required physical/two-device/offline/new-origin and broad playback conditions
  are unaccepted. Current PC output blocks the planned30s-return slice. Preserve
  its failure; lower audio stage/driver remains unknown. No volume/output settings,
  permissions, driver/service/browser changes or transcoding are authorized by
  packaging this evidence.
- **G6 unapproved/unperformed:** candidate deployment proof E2 is not main merge,
  push or production replacement approval. Production serving smoke after an
  approved release has not occurred. Do not label this ZIP production-ready.
- **G7 package handoff is bounded:** this matrix exposes every QA row, provenance,
  failed/unknown observations and rollback limits. Root still owns package
  allowlist/hash review and the fixed source/evidence manifest. Exclude tokens,
  private recovery envelopes, IDs/names, original media and private screenshots.

Small next discriminators remain with their owners: WP07 must parse actual tracks/
codec/index before any ISO playback support claim; WP06 needs stable original
playback before a real30s return; WP08 needs approved live two-device/offline
propagation; WP05 needs a separately secured normal-UI disposable run rather than
global write unlocking; WP09 needs the actual physical matrix. Cursor/overlay/
loading/general UI requests remain **QUEUED/unstarted after current core work**,
not overriding dependencies. D-056 pause-without-overlay stays binding.

Restore using the recorded known source/public tree and independent schema/read
checks, never a force reset or automatic undo of remote state. Keep existing
legacy/writers and five private recovery envelopes. Old-code/local-provider
compatibility E1 supports preparation; live rollback behavior is still unaccepted.
