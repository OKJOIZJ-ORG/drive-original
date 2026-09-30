# Night work environment — 2026-09-30

Audience: a later Codex agent in this Windows workspace, without this chat.
**Current mode: ENVIRONMENT ONLY / WAIT FOR EXPLICIT NIGHTTIME START (D-064/D-065).**
The product goal remains incomplete. Do not run media/acceptance tests, edit the
product, deploy a candidate, or create a scheduled wakeup during this preparation.

## First action

Run `node qa/night-environment-20260930/preflight.cjs` from
`C:\extensions\Drive-Original\source`. This only checks local prerequisites and
prints a redacted snapshot. It does not start the work. Then read current
`memory/CHECKPOINT.md`, `memory/DECISIONS.md` and Git status. Preserve unrelated
changes. After the human's explicit nighttime start, continue all executable
approved units; a verified unit/commit is a savepoint, not the whole goal.

## Fixed identity and tools

- Canonical Git root: `C:\extensions\Drive-Original\source`; branch
  `codex/v2-kickoff-diagnostics`. Preparation began at
  `0fcb50bfe7ff7beec3c9469a0f759ccd41e27872`. Later documentation commits do not
  change the fixed public source `3ebd97df80144fb8ebbaf1f945394a796d4425b8`.
- Candidate runtime `1.22.0-rc.21`, Worker
  `b1021a42-fb32-47d5-92be-7fd92736faf7`:
  <https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/>.
  `memory/CANDIDATE-RC21-20260930.md` owns delivery and current acceptance limits.
- Codexon shutdown was explicitly authorized and performed against its verified
  installed executable paths. Fresh readiness checks count only that application.
  Existing launch floor: physical free >1,048,576KiB and virtual free >1,572,864KiB.
  Recheck at night; current headroom is not a durable reservation.
- Portable official scrcpy4.1/ADB1.0.41 is installed only under
  `C:\extensions\Drive-Original\maintenance\tools\scrcpy-v4.1\scrcpy-win64-v4.1`.
  The vendor ZIP SHA256 is
  `5b12172b3264b2889f4583ee64752ce832e29bc8b1089dca81093459697165db`.
  Both version commands passed. Setup record:
  `C:\extensions\Drive-Original\maintenance\tools\scrcpy-v4.1-setup.json`.
  [Official Windows instructions](https://github.com/Genymobile/scrcpy/blob/master/doc/windows.md).
- Existing `qa/node_modules/playwright` and installed Chrome are reused. A real
  Chrome DevTools MCP list/evaluate on managed `about:blank` passed after memory
  recovery. That profile is separate from the signed-in personal Chrome profile.
  Native Windows `@oai/sky` inventory/state calls were also observed callable.

## Human prerequisites and current boundaries

- **Android connected and login observed ready at22:20:** one authorized ADB
  device, Samsung SM-X800/Android16/Chrome153.0.8010.52. The human enabled USB
  debugging, authorized this PC and signed in. Official Chrome DevTools MCP1.10.1
  list/evaluate reached the existing exact candidate, runtime1.22.0-rc.21, with
  library visible, account key present, setup hidden and an active SW controller.
  PC/Android same-account identity is not independently proved. No playback,
  gestures or OS-return acceptance ran. The owned temporary ADB forward and MCP
  client were removed/closed. Evidence: `qa/android-environment-20260930/`.
  Reduce ADB output to counts/status; never export serial numbers. At night select
  exactly one authorized device in memory. Keep the device connected, powered
  and available. Phone Link/Bluetooth alone is not a control proof.
- **Cloudflare login observed ready:** the normal Chrome tab reached the existing
  account home with Workers navigation, without a sign-in/password screen.
  The agent did not enter credentials, solve 2FA or create a grant. Recheck the
  live session at night before the narrow plan/observability reads.
- **PC local QA file access observed ready at22:34:** the human confirmed manually
  enabling the ChatGPT extension's file-URL access. In the existing personal
  Chrome candidate tab, a temporary isolated file input accepted the exact
  `qa/rc21-actual-corpus/factory.expression.js`. Read147087bytes/SHA256
  `ed770ee121253885365914c9013c2e279504580f0be49ab376ea7f5d7b165ad1`
  matched local bytes. No network upload handler or factory execution; the
  temporary input/iframe was removed. This proves local file delivery only.
  Evidence: `qa/android-environment-20260930/pc-file-access.json`.
  The agent changed no security setting. Preserve the older loopback
  `ERR_BLOCKED_BY_CLIENT` failure; do not bypass it with alternate hostnames.
- Keep the PC and the intended Chrome profile available, powered and unlocked
  during the run. Current `powercfg` readback reports AC sleep, hibernate and
  display timers all0 (never). No power/security setting was changed during
  preparation. Do not assume a lock screen is controllable.
- Phone Link displayed an iPhone connection flow, not an Android/iOS test screen.
  Android proof does not close physical Safari/standalone/VoiceOver requirements.
  Any inaccessible real-device or remaining publication gate stays explicitly open.

## Resume queue after the explicit start

1. Run the read-only preflight and establish current branch/diff, real MCP call,
   personal same-account candidate session and device status. Do not export
   cookies, bearer credentials, private Drive/account IDs or raw dashboard data.
2. Investigate the full SW replacement/reload/reopen failure using the next
   distinct discriminator: fixed Buffer static serving rather than streamed
   serving, with the same provider/app/SW/native flow. The prepared driver is
   `qa/rc21-controller-continuity-investigation/fixed-body-v2.cjs`.
   **Copy it to a newly named result-producing attempt and change only its result
   filename before execution**, because its current result is a preserved
   memory-gated failure. Keep source/producers/old failures intact. Review the
   actual outcome before any product change; retain sticky false retirement,
   source/account/file/session/lifetime fences and explicit reload behavior.
   Previous CDP compiled scripts were identical across four real activations;
   no-media routed/unrouted controls were stable. Do not retry identical harnesses.
3. Actual corpus: `qa/rc21-actual-corpus/factory.expression.js` and SW proof are
   version-pin-only adaptations of the qualified rc16 factory. No media probe
   has run in this leaf. Local filechooser delivery is now qualified; execute the
   factory only after the nighttime start. Reconstruct canonical private source
   identity inside the current browser before reads.
   A unique size alone does not establish the historical immutable identity.
4. Continue uninterrupted actual expiry/position, native OS-return, long resource
   checks and approved disposable UI/state recovery. Use physical Android and a
   second independently authenticated device when available. Scope evidence by
   PC, local/synthetic, real Android and real iPhone; never promote one to another.
5. `qa/rc21-hosting-security/README.md` owns completed official analytics reads
   and13 local synthetic security discriminators. Plan/subscription and billable
   info both returned403; null/omitted observability is still UNKNOWN. Use the
   existing logged-in dashboard for exact plan/card/automatic-billing and explicit
   logging settings readback. Hosted credential negatives require the real
   session owner without extracting credentials. Do not repeat completed reads
   or claim synthetic checks establish authenticated hosted behavior.
6. Keep the existing69-row baseline/42 remaining mappings and completion gates.
   Integrate coherent fixes, proportionate checks, records and local commits.
   Continue independent executable work when a device-specific gate is unavailable.

## Authority and cleanup

D-050/D-051 scope remains local/free candidate/own state/explicit disposable QA.
No main/push/production transition, original media mutation, expanded grants,
terms/payment, automation resume or volume changes. Production remains
v1.21.0/e08989a. Automation is intentionally PAUSED. No nighttime wakeup was set.
Stop and report a genuine unsupported/user-controlled boundary accurately.

Child-owned test browsers/servers and the failed root loopback server were closed.
Preserved user-session candidate and Cloudflare tabs remain for later work.
Chat On Steroids' unattributed-calls security expansion was refused; CUA's existing
Chrome path works. Do not enable unattributed calls as a recovery workaround.
Portable tools are outside the source Git root; do not initialize another repo or
commit their ZIP/executables. Stage only curated safe source QA/doc files; raw
hosting/private recovery records stay ignored. Preserve exact evidence bytes.

## Preparation verification

Fresh zero-context round1 executed the preflight successfully and found a stale
decision/checkpoint reference while those records were being updated. The
references were aligned. Fresh round2 executed the First action once and confirmed
the handoff, D-064, checkpoint and goal all agree on environment-only WAIT, with
no blocking ambiguity. Exact redacted preflight stdout and round2 record are in
`qa/night-environment-20260930/`. That17:13snapshot has deviceReady=false because
the device was then deferred; it is preserved as history, not current readiness.
Later22:20Android and22:34PC file-access checks pass in
`qa/android-environment-20260930/`. Android v1/v2 failures were parser/response-
shape assumptions; both producers/results are preserved and v3 passes.
Do not rerun a result-writing producer over preserved evidence: copy
`readiness-v3.cjs` to a newly named attempt and change its output filename first.
These are preparation proofs; no product/media acceptance has started.
Fresh22:39read-only preflight is `qa/android-environment-20260930/preflight-connected.json`:
pcToolingReady=true/deviceReady=true/Codexon0; existing physical/virtual memory
floors pass. Recheck at the explicit start, since connection and headroom can drift.
