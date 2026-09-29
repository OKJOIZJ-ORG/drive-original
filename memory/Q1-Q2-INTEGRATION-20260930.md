# Q1/Q2 local integration — 2026-09-30

Local rc.15 integration, not production or complete device/corpus acceptance.
The local integration is committed at ee0ac8449e37a982ab2204b5b65e472a6e04b6f4.
The later verified rc.15 candidate delivery is separately recorded in
CANDIDATE-RC15-20260930.md; production v1.21.0/e08989a and automation PAUSED remain.

The actual app now connects its bounded general Q1 packet-copy and Q2 stereo
AC3/EAC3 audio path to the exact Q0 revision snapshot. Q2 retains encoded AVC
video and declares lossy Opus audio. The old TS path remains separately owned.
Private source/account/session/controller fences and whole source/consumer
retirement apply before replacement. A correlated controlled-window capability
reply prevents assigning Q0 to an older worker that cannot serve its protocol.

Independent review produced and resolved three concrete counterexamples:

- Probe cleanup could outlive its owner while retirement reported success.
  `setupDone` now represents the actual probe lifetime; uncertainty remains sticky.
- Optional Q2 inspection budgets also rejected native AAC. Only seven explicit
  bounded-inspection codes may preserve Q0 after confirmed settled cleanup.
  Malformed, transport, permission/content and uncertain-cleanup failures remain
  terminal. The mutated sample counter is an allocation discriminator, not a
  complete valid long-film test.
- WebCodecs input support was mistaken for HTML file support. Exact combined
  native codec `canPlayType` now determines original file preference: `probably`
  preserves Q0, empty is unsupported, and `maybe`/unavailable/rejecting queries
  preserve Q0 as unknown. Qualified Q2 output eligibility is separate from
  WebCodecs input diagnostics. Pending decoder/encoder queries race owner abort,
  remove listeners, reject pre-aborted work and prevent later queries. The real
  probe with a mocked pending API now ends after abort with `GENERAL_CANCELLED`,
  source settled and zero encoder queries. This is deterministic ownership proof,
  not an observed real Chrome API hang or Safari support mismatch.

Final current-source verification:

- Complete Node product suite **557/557**, with stable before/after hashes, in
  `qa/q1-q2-release-integration/product-tests.json` and `.log`.
- Final installed isolated Chrome **3/3** in
  `qa/q1-q2-app-integration/native-file-capabilities-smoke-results.json`:
  AC3/EAC3 exact combined native unsupported declarations select Q2; AAC's
  positive declaration preserves Q0. Actual synthetic-provider app/SW/worker
  frames, seek, source end and settled close pass with stable final producer maps.
  This run follows final capability cancellation changes and app LF normalization.
  The prior report is retained as `native-file-capabilities-initial-results.json`.
- Independent final narrow review is clean, with the original pending-query
  discriminator rerun. Earlier six-case retirement smoke, Q1 packet/clock/color
  oracles and Q2 packet/pixel/audio/end-window proof retain their original hashes
  and dated scopes; they are not retrospectively repinned to final source.
- Source verification checks all **81** Q1 archive materials and exact runtime,
  all **seven** Q2 parts/53,597,911 combined bytes and exact codec artifacts,
  six current readable adaptations and every license-page link. The public
  manifest has **51** files, **40** shell entries and **eight** uncached source
  archives. Build metadata remains private. Later matching public delivery and technical
  source readiness are owned by CANDIDATE-RC15-20260930.md.

The Q2 archive is an unchanged codec/relink target and preparation-time wrapper
snapshot. Current modified readable JavaScript is delivered directly at the six
same-origin media paths named in `licenses/audio-source-NOTICE.md`; the license
page exposes those source files. The current build record pins their hashes.
The unchanged WASM remains `48f85a683a94f6b35a21ce33c12a99312ac64e450eca4a9fffba36b5067e83bf`.
Earlier same-toolchain relink/bridge reproduction is reused by exact identity;
no new complete cross-host build is claimed.

`qa/q1-q2-release-integration/curated-savepoint.json` selects exact current files,
historical producers, synthetic fixtures, failed attempts and final proof. It
excludes duplicate large source/static libraries already in the source package,
installed SDK/cache, regenerable long input/output and private account artifacts.
Portable codec relink instructions belong to the source package; the old local
copy-build script additionally requires its documented QA inputs to be restored.

The dated rc.13 qualification retains all **69** IDs with 25 passed, 38 not-run,
four blocked and two conditional N/A. These new local slices do not promote
QA-FM-02/03/04 or physical-device rows to full acceptance. Q3 is separately saved
at `5af7cdf` with synthetic-only scope. Actual-account rc.15 replay, 30-second
background return, physical Android/iOS, broad formats, two-device propagation,
long-duration/resource costs and historic 299-second/intermittent cold failures
remain open. The personal Chrome bridge's focus calls timed out; the inspected
ADB locations and present-device inventory supplied no usable Android path.
No volume/output setting, source media, production, main/push or automation
change is made by this integration.
