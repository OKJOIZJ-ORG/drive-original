# Checkpoint — V2-07A MPEG-TS browser probe locally verified — 2026-09-26

## The story so far

Repository is now `C:\extensions\Drive-Original\source`, branch `codex/v2-kickoff-diagnostics`; resume HEAD was `2294cf5`. The old Desktop location is absent. Existing ignored MPEG-TS drafts were preserved and completed, not reset. `qa/v2-07a-container-probe/results.redacted.json` pins the final parser hash and a read-only local priority-prefix observation: 65,536 bytes, stable local stat identity, 348 TS packets, one PAT/PMT and two observed H.264/AAC headers. This is not current authenticated Drive or playback evidence.

Parser tests pass 44/44, independent follow-up 16 assertions pass, and unchanged nine-file product tests pass 269/269. Full ADTS frame/SPS trailing syntax, sticky unexpected continuity loss, declared-discontinuity separation, finite PES ownership and TEI/reserved-adaptation invalidation now have explicit gates. Only QA code changed.

Historical product candidate remains 1.22.0-rc.4 (3597e63), Worker 28d2a9fc-730e-48d4-b060-8e49554a8c7b; it was not redeployed or freshly verified this session. Prior iPhone 1/2/3 acceptance closes the reported OAuth loop only. Prior live reconciliation was 38/38 metadata-stable; prior front magic included 15 MPEG-TS and eight ISO-BMFF. Those remain separate dated observations, not current live proof.

## Decided

- D-050/D-051 remain active: browser/PWA, direct browser/SW Drive bytes, minimal same-origin serverless auth; no server media relay.
- No main merge, push, production replacement, original mutation, sharing/billing or automation restart.
- V2-07A is the sole READY workstream; V2-07B product Q1 integration is not yet accepted.
- Local parser/evidence are committed at `3f49d1c`. The separate browser adapter now passes 53/53 focused tests and combined parser/core/adapters/transport/app/static/SW integration passes 370/370. It reuses the proven SW route, gates detail evidence on complete structure, holds metadata ownership through JSON settlement and caps total adapter dispatches at 512/ten minutes. `aggregateAvailable:false` explicitly marks discarded metrics on whole-run failures; zero placeholders are not zero-work proof.
- The three-artifact QA registry preserves the old bounded adapter and reconciler byte-for-byte and adds only the reviewed public MPEG-TS composite. Local no-binding Wrangler dry-run passed. Remote readback still showed QA version `68cf79bb-3c04-4cbf-8472-ffa3880d9836` and both prior exact 200 artifact bodies; no deployment has occurred yet in this slice.

## Waiting on the user

None for local work. Current native computer-use node_repl is unavailable; fallback desktop observe returns Tool observe not found. No authenticated browser probe or device check occurred this session. Do not reinterpret earlier logins as a current connected session.

## Next first action

Deploy the committed three-artifact registry using worker/node_modules/wrangler/bin/wrangler.js and qa/v2-07a-browser-transport/wrangler.v2-07a-transport.json only; verify exact remote GET/HEAD bytes and headers, then run the one-shot authenticated probe only after browser control is available.

## Tried

- Original paused parser drafts passed 36 tests but missed complete-frame/SPS and continuity evidence boundaries; eight new regressions plus fixes now pass.
- Raw cross-origin Drive Range response cannot satisfy the shared core's exposed Content-Range/no-store contract; reuse the previously validated client service-worker path instead of adding a media server.
- Local stat stability does not revalidate Drive file/version, whole-file hash, decode, seek, iPhone playback or expiry/sleep-wake behavior.
- Rollback: revert only isolated QA commits; originals, product candidate and production require no recovery because they were not changed. Outgoing checkpoint is archived under memory/checkpoints/20260926-mpegts-parser-resume.md.
