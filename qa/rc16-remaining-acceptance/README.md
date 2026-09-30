# Remaining acceptance triage — 2026-09-30

Read-only source/evidence triage on `codex/v2-kickoff-diagnostics`, observed HEAD
`4e69a79` with root-owned rc.16 presentation/version changes pending. This is
an overlay on the fixed rc.13 qualification, not a new qualification run or
promotion. No browser, account, original body, Google write, product or version
file was operated by this unit. All confidence labels below describe the saved
evidence's scope, not current live runtime validity.

The preserved matrix still has **69 IDs: 25 passed, 38 not-run, 4 blocked,
2 conditional not-applicable**. The 42 outstanding rows are mapped below.
No row has been silently removed or marked passed. Already qualified injected
contracts should be reused, with their fixed producers, rather than replayed
because the historical matrix uses `not-run` for a broader row.

## Evidence owners

| Key | Exact owner | Scope |
| --- | --- | --- |
| B | `qa/candidate-rc13-qualification/report.json`, `qualification-matrix.md` | Fixed `570f9c38506d1e426c33cf65b73836d32bf872c0`; original 69-row status/requirements |
| C | `memory/CORPUS-RC10-20260928.md`; `qa/v2-07a-current-corpus-probe/live-rc10-results.json`, `selection-diagnostic-results.json`, `metadata-catalog-rc11-live-results.json` | Current 36 risk representatives; individual byte/TS checks and separately passing later metadata comparator; old final rejection retained |
| I | `memory/ISO-TRACKS-20260929.md`; `qa/v2-07a-iso-tracks-rc11/live-sparse-results.json`, `README.md` | One actual large ISO, sparse structural tracks; no sample/config/HDR/VFR/decode qualification |
| F | `qa/v2-live-format-playback-rc12/README.md`; `qa/v2-live-format-playback-rc13/qualification-summary.json`; `qa/v2-live-webm-rc13/README.md` | Actual desktop large-ISO, declared MKV/AVI, short WebM starts/seek/close; exact old candidates; no audibility/device/full corpus |
| Q0 | `memory/Q0-PRODUCT-20260929.md`; `qa/q0-provider-product/README.md`; `qa/q0-revision-pin-disposable-rc13b/README.md` | Immutable original revision product contracts/local native path plus separate actual disposable A/B provider proof |
| Q12 | `memory/Q1-Q2-INTEGRATION-20260930.md`; `qa/q1-q2-app-integration/native-file-capabilities-smoke-results.json`; `qa/q2-general-product-integration/README.md` | Final rc.15 synthetic-provider actual app/SW Q0/Q2, fixed packet/pixel/audio oracles; qualified narrow profile |
| Q3 | `memory/Q3-FEASIBILITY-20260930.md`; `qa/q3-browser-execution/README.md`, `evidence-manifest.json` | Synthetic MPEG4 Part 2 decoder to lossy VP9, 3 browser/2 oracle passes; no corpus necessity or product activation |
| LF | `qa/rc15-lifecycle-qualification/README.md`, `summary.json` | Fixed rc.15 installed isolated Chrome: mixed50/150, Q1/Q2 same-route16/48,72s ends; native memory plateau open |
| UI | `qa/rc15-player-ui-qualification/README.md`, `results.json`; `tests/player-presentation-owner.test.js` | rc.16 six strict actual-app synthetic-provider native cases, desktop/touch emulation; composite owner fix; no physical device |
| P | `memory/Q0-AND-PRIVACY-20260929.md`; `qa/candidate-privacy-rc13/README.md`; `memory/CANDIDATE-RC15-20260930.md`; `qa/candidate-rc15-delivery/redacted-readback.json` | Reproduced console canary repair, fixed candidate public/cache/source isolation and anonymous cold/offline; hosted/historical logs separate |
| S | `memory/STATE-NORMAL-20260928.md`; `memory/STATE-SNAPSHOT-20260928.md`; `memory/STATE-RECOVERY-20260928.md` | Actual desktop same-account raw union/legacy/normal sync/reload and protected recovery; two physical devices separate |
| M | `memory/DISPOSABLE-20260928.md`; `qa/v2-disposable-live/README.md` | Actual restricted canonical-controller newly created disposable move/trash/restore/readback; normal UI remains write-disabled |
| A | `memory/Q1-LIVE-20260928.md`; `memory/PC-POSTREBOOT-20260929.md`; `memory/architecture/V2-04A-AUTH-CONTRACT.md` | Historical actual natural renewal and desktop priority proof plus deterministic auth owners; no complete physical/return/duration matrix |

## Exact outstanding-row coverage ledger

`High` means the cited saved producer/result directly supports the limited
observation. `Medium` means broader acceptance needs an unmeasured dimension.
Neither label promotes a fixed old-source result to rc.16/live acceptance.

| ID | Baseline | Current usable evidence / confidence | Remaining discriminating gap |
| --- | --- | --- | --- |
| QA-TR-01 | not-run | F actual4.6GB first frame before whole buffering; Q0/LF cold synthetic app / High | Current candidate actual cold-cache large Q0 trace, initial bytes and progress; physical matrix |
| QA-TR-02 | not-run | B local tail-index fixture; I actual front moov / High | Actual tail-index MP4/MOV topology and bounded first-frame/seek route, not another front-moov replay |
| QA-TR-03 | not-run | F actual50/90% targets; A priority10/50/90%; UI12 decoded targets/LF150 seeks / High | Same actual file/version current source10/50/90%, independent audio and source retirement, devices |
| QA-TR-10 | not-run | Q0 immutable snapshot/local current consumer fences + actual disposable revision A/B / High | Refreshed fixed-source full Q0/Q1/Q2 route source-change/recovery ledger; keep actual provider proof distinct from original mutations |
| QA-TR-12 | blocked | A natural renewal; LF72s original end / High | Actual hidden30s return, current natural expiry/late seek, long duration; historic299s remains unexplained |
| QA-FM-01 | not-run | C36 byte-risk cover,15TS structures; I1ISO tracks; F selected decode / High | Full codec/profile/track inventory, unknown2 and remaining ISO/WebM tracks, Q-route/device matrix |
| QA-FM-02 | not-run | F actual TS-in-MKV/AVI + priority; Q12 Q1 encoded/clock/color preservation / High | Container/track combinations outside strict Q1 admission, actual audio/selection/device evidence |
| QA-FM-03 | not-run | Q12 actual app synthetic AC3/EAC3 Q2; encoded AVC/pixels unchanged, lossy Opus quality/end proof / High | Actual corpus AC3/EAC3 existence and fit to stereo48kHz/no-B/explicit-color/unfragmented profile; device/resource/audio evidence |
| QA-FM-04 | not-run | Q3 synthetic exact unsupported MPEG4 profile plus lossy output / High | Actual unsupported video evidence; product Q3 admission/owner/resource/profile integration. Corpus absence is not established |
| QA-FM-05 | not-run | F actual SAR/TS clock repair; Q12 synthetic SAR/color/timeline / High | Actual multi-audio/silent/subtitle/rotation/VFR topology then selective playback; unsupported cases remain explicit |
| QA-FM-06 | not-run | I explicitly leaves HDR/depth unqualified / High | Actual HDR/high-depth presence from bounded configs; cannot use N/A until corpus evidence exists |
| QA-FM-07 | not-run | B static GIF/list contract; C GIF/WebP signatures / High | Native actual-product animated WebP/GIF animation, alpha/timing plus actual selected corpus/device viewer |
| QA-FM-08 | not-run | B image/error unit cases; C JPEG/PNG signatures and rare BMP metadata / High | Native actual-product large image/wrong-MIME/BMP path, no omission or video fallback; actual corpus/devices |
| QA-FM-09 | not-run | B malformed/storage contract; Q12 corrupt synthetic EAC3 zero append / High | Native actual-product truncated/unsupported image/video classification; actual corruption only after independent original evidence |
| QA-AU-01 | not-run | A actual rc.10 natural renewal; B deterministic expiry; S reload / High | Current candidate actual renewal/position/list plus platform matrix |
| QA-AU-06 | not-run | Direct reader/B-auth architecture; no Google iframe selected / Medium | A real browser blocked-third-party-cookie setting with actual app path, then iPhone contexts; architecture alone insufficient |
| QA-AU-10 | not-run | S actual legacy inclusion/raw backups/own writer/empty-shadow / High | Fixed current client/origin identity and current state readback; complete physical migration comparison |
| QA-ST-01 | not-run | S desktop sync and B deterministic two-writer convergence / High | Two physical foreground devices, like/unlike/viewed propagation without reload/refocus |
| QA-MU-01 | blocked | M actual restricted disposable trash/readback / High | Normal candidate UI safe new-target write policy/test mode; global writes=false is intentional deployment state, not missing general write authority under D050 |
| QA-MU-02 | blocked | M actual restricted move/parents readback / High | Normal candidate UI/gallery target qualification with exact new allowlisted IDs; same write-state distinction |
| QA-MU-09 | not-run | M API independent readback / High | The approved disposable API/web/G: comparison and explicit desktop-sync lag observation |
| QA-MU-10 | not-run | M recoverable final file trash +2 retained new folders / High | Read private pre-state/recovery first; exact remnants and approved restoration cleanup. No automatic permanent delete |
| QA-UI-01 | not-run | UI rc16 native Q0/Q2 paused/playing/reopen state preserves hidden chrome / High | Refresh full row ledger with UI scope; physical playback states still separate |
| QA-UI-02 | not-run | UI trusted desktop lower reveal/center dismissal/cursor / High | Explicit desktop leave-hide timer coverage if not in rc12 owner audit; physical/current candidate observation |
| QA-UI-03 | not-run | UI trusted touch-emulated44px reveal/dismiss preserves playing / High | Actual D056 reported iPhone hit area/mode; emulation cannot close report |
| QA-UI-04 | not-run | UI exhausted-original UI injection dismissible recovery with settled close / High | Real exhausted source/transport failure route + physical external action behavior, not injection relabeled as network failure |
| QA-UI-05 | not-run | UI trusted Space resume/Tab reveal; B native-button fixture / High | Actual click-then-Space and Tab-button-Space explicit single-action native-input check if missing from preserved rc12; devices |
| QA-UI-06 | not-run | UI keyboard reveal/reachable controls / High | Physical VoiceOver, focus trap and explicit reveal on actual iPhone |
| QA-UI-07 | not-run | Preserved rc12 four-viewport/cancel/multitouch synthetic audit / High | Physical long-press/context-menu/drag interaction; no need to repeat identical synthetic gestures |
| QA-UI-08 | not-run | Preserved rc12 edge/interior/cancel generation-owner audit / High | Actual OS edge navigation/gesture cancel/re-entry on physical devices |
| QA-UI-09 | not-run | Preserved viewport geometry; UI two presented native sizes / High | iPhone rotation/tab/PWA/native fullscreen safe areas and accessible close/seek |
| QA-UI-10 | not-run | UI12 seeks loaderfalse/poster handoff; S normal sync; P quiet errors / High | Whole current candidate UI/status audit and physical preparations; no repeat of fixed presentation defect |
| QA-LF-01 | not-run | LF50mixed/150 seeks, counters balanced/DOM stable / High | Native private-memory plateau: mixed renderer161→402MiB; Q2 same-route176→302→293MiB after15s idle. Product leak vs decoder/cache/high-water unknown |
| QA-SE-02 | not-run | P exact console canary repair/public/cache/source isolation / High | Hosted retention/log policy and current exact artifacts; historical/all-process secrecy cannot be inferred or retroactively repaired |
| QA-RP-01 | blocked | A/F historical actual priority PC and user-reported iPhone playback / High | Exact current same version/ID cross PC/iPhoneChrome/PWA/Safari comparison, audio/seek/close |
| QA-SL-01 | not-run | A token/session contract and real renewal; S reload / High | Actual current expiry/revoke/reconnect and physical context preservation |
| QA-SL-02 | not-run | B deterministic persisted lease/revision concurrency / High | Two devices/serverless instances actual concurrent refresh, no forced regrant/revoke without owner action |
| QA-SL-03 | not-run | B Origin/CSRF/no-store/account contracts; P current public/cache isolated / High | Hosted logging/retention plus live negative authorization boundaries; do not emit credentials in diagnostic output |
| QA-SL-04 | not-run | Fixed free/no-card delivery and bounded synthetic quota errors / High | Read-only current free-plan resource metrics/limits and controlled exhaustion policy; no load storm or paid switch |
| QA-SL-05 | not-run | Historical user-confirmed PWA return/relaunch / Medium | iPhone Chrome tab/PWA/Safari OAuth callback contexts; cannot infer cookie sharing from same-origin |
| QA-SL-07 | not-run | S same-account union/writers/backups/old-code compatibility / High | Current origin/client identity plus two-context/device migration recovery proof |
| QA-SL-08 | not-run | P current public private404/source isolation/production unchanged record / High | Current account API/diagnostic authorization matrix; production replacement remains separate G6 authority |

## Corpus and Q2/Q3 coverage that is actually known

The historical actual rc.3 inventory contains8,463 physical files,2,052 videos,
6,410 images,11 requested extensions, all14 rare MKV/AVI/BMP objects and20
videos at least an hour. That is **dated metadata**, not current counts or codecs.
Its38 representatives/64metadata categories are historical. The later actual
rc.10 selector found36 representatives with every mandatory/risk/identity gate
passing. Do not restore38 as an acceptance prerequisite.

The actual36 body checks cover15 MPEG-TS,6 ISO-BMFF,7 JPEG,2 GIF,2 PNG,1 WebM,
1 WebP and2 unknown signatures. The only batch track evidence is15 TS programs /
30 streams: H264 + AAC-LC48kHz stereo;13 H264 High Level3.0 and2 other parsed
profiles, one360x640BT709 limited target. The single separately inspected ISO
is4,607,107,537bytes, AVC100/level50 1920x1080 with identity matrix and AAC-LC
stereo48kHz. Its sample tables, AVC parameter sets, edit lists, HDR/VFR/subtitles
remain unqualified. There is no redacted per-object route↔risk mapping in these
aggregates. In particular, do not infer which rare extension is one of the two
unknowns, or assume every declared MKV/AVI is a genuine Matroska/AVI container.

Actual short WebM, large ISO, priority and two TS-in-declared-MKV/AVI playback
observations establish only their individual old-candidate desktop scopes.
Neither AC3/EAC3 corpus presence nor unsupported video absence/presence is
established. Q2's synthetic profile is narrow: unfragmented AVC, fixed parameter
sets, no B-frames, explicit color, stereo48kHz AC3/EAC3 to lossy Opus;65,536
samples/track and4MiB metadata budgets remain. Common long files can exceed
that inspected profile without being corrupt. Q3's MPEG4Part2 sample is synthetic.

### Smallest next actual read-only discriminating scope

Root owns browser/account execution. Reuse the canonical inventory and selector
inside the authenticated page, with current account/session/controller/content
pre/post fences. Persist only whitelisted aggregate results and opaque
run-local sample labels; keep names/IDs/paths/versions/config bytes private.

1. Reconstruct the current manifest and cross-map to prior private sample/version
   records if still available. This is metadata-only; do not replay36 body prefixes.
   If those records were released, record that identity continuity is unknown
   rather than claiming five exact uninspected ISO objects are already identified.
2. First batch: the remaining **at most5 ISO** members of the previously6ISO
   representative slice, excluding the exact large-ISO version already probed.
   Use existing sparse-moov/probe per-file limits unchanged: serial64requests,
   2MiB+8192bytes,50s/file,10s inactivity, no retries. Track/sample-entry tags and
   explicit codec config profile/layout presence are the discriminator. Stop
   incomplete, unknown layout, owner change or unsettled cleanup; no cap raising.
3. Next separate batch: the1WebM member's bounded EBML Tracks and the2unknown
   signatures **after metadata classifies them**, using a reviewed capped parser.
   No maintained actual EBML-track parser is established by this triage. Prepare
   that adapter locally against synthetic fixtures before any real body read.
   Do not send an image to a video codec probe simply because magic was unknown.
4. An observed AC3/EAC3 track triggers a single actual-file Q2 fit/capability
   discriminator (rate/channels, B-frame ordering, color, sample budget, seek and
   unchanged encoded AVC); it does not trigger blanket Q2 activation. An observed
   unsupported video/config triggers exact native capability + Q0/Q1/Q2 refusal
   proof before any actual Q3 transformation. Absence in this small sample cannot
   establish absence in2,052 historical videos or current corpus.

The first ISO batch has a maximum320media requests and5×(2MiB+8192)bytes;
run files separately rather than multiplying the existing60s overall run limit.
The full current inventory/probe expansion required by CORPUS06 remains separate.

## Prioritized next units (maximum six)

1. **Native resource discriminator, account-free.** Extend LF's same-route Q2
   measurement beyond the existing16cycles in one fixed context, with Q0/control
   route and actual owned renderer/worker memory after every settled close and
   bounded idle/context-close endpoints. A50cycle target with existing headroom
   stops discriminates continued growth from a plateau. Keep source maps fixed;
   do not assert a leak from slope alone. Root assigns the driver; this triage
   executes no browser. QA-LF01 stays partial until evidence resolves native costs.
2. **Native image/animation slice, account-free.** Reuse app/SW/provider harness;
   generated GIF and animated WebP with known frame timing/alpha, wrong-MIME BMP
   and bounded large PNG/JPEG. Add only native decoded viewer/static-list/error
   cases absent from old contracts. No media downgrade; actual corpus/device
   rows stay partial. Covers the concrete local gaps within QA-FM07/08/09.
3. **Actual corpus track discriminator preparation, account-free, then root
   read-only execution.** Parameterize the existing sparse ISO driver for a
   single explicit private selection without changing limits; test independent
   AVC/AAC/AC3/EAC3/unsupported tags and an EBML Tracks parser against synthetic
   fixtures. Root then runs the small scopes above. This supplies a reason for
   actual Q2/Q3 work instead of inventing need from extensions.
4. **Long source-clock/cleanup discriminator, account-free.** Existing72s native
   ended proof does not cross299s; Q1's first long record lacks post-long app/SW
   retirement. Generate one finite >360s original and run the automatic Q2
   path at1x, target seeks and settled close with source-clock/output/end/resource
   observations. This is a new duration boundary, not another72s replay. It
   cannot explain the historical actual299s failure or replace actual expiry.
5. **Blocked-cookie and focus clauses, account-free.** One actual isolated Chrome
   profile with an observable blocked-third-party-cookie policy, synthetic own
   session and actual app/SW original playback; verify iframe-independent path
   and the specific native click→Space/Tab-button-Space/leave-hide clauses not
   already pinned by UI. Keep it a local contract slice; iPhone callback/VoiceOver
   and actual Google session remain physical/live rows.
6. **Current qualification overlay/host diagnostics, read-only.** Once rc.16 is
   fixed and delivered, bind exact public/cache/package/source maps and existing
   Q0/Q12/UI/LF producer identities to the42-row overlay. Root can inspect free
   plan metrics/log-retention/negative-auth configuration within existing candidate
   access, and prepare a narrowly scoped normal disposable UI test mode if needed.
   Keep normal writes=false until its exact allowlisted controller owner exists;
   do not promote hosted privacy, physical rows, or G6 from config/artifact proof.

G5 physical iPhone Chrome/PWA/Safari, Android-first alternative, actual two-device
state/refresh, actual background return and normal-account acceptance remain
distinct. G6 main/push/production transition needs explicit user authority.
Browser bridge/device unavailability blocks those executions, not the independent
local units above. D056 forbids revealing chrome merely because playback pauses.
