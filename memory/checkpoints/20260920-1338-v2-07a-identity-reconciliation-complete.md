# Archived checkpoint — V2-07A live front sniff complete; identity reconciliation next — 2026-09-20 13:05 KST

## Current state

- Repository: `C:\Users\jbs\Desktop\폴더모음\자작프로그램\Drive-Original\source`
- Branch: `codex/v2-kickoff-diagnostics`; no merge or push is authorized.
- Read-only product candidate: `1.22.0-rc.4` at product commit `3597e6399056908542680f2a7a5266effd40e96a`, Worker version `28d2a9fc-730e-48d4-b060-8e49554a8c7b`.
- Candidate remains `driveMutationsEnabled:false`; production, `main`, original Drive files, remote branches and the paused automation are unchanged.
- User physical acceptance is recorded for all three iPhone home-screen PWA checks: update/open, OAuth return to `Drive 연결됨` with the real list, and full terminate/relaunch without renewed consent. This closes the reported standalone OAuth loop only.

## Closed V2-07A unit

The reviewed zero-argument, one-shot candidate-browser adapter is fixed at `e0f8228`. It performs its own fresh authenticated two-pass root inventory and deterministic 38-object selection inside a private closure. The caller cannot supply file IDs or a manifest. Account, app version, read-only mode, service-worker controller, generation, lifecycle and all app-owned media-idle fields are fenced before and throughout the run. The public global is removed synchronously on first invocation.

The bundle was served by the isolated no-binding QA Worker `drive-original-v2-07a-browser-transport`. The visible integrity-header correction is fixed at `465cf41`; current transport version is `c6544964-525e-4eaf-8af2-27413c1553fa`. Local, remote and in-page bytes matched SHA-256 `5EA41F6C7C369ACCC2D9ABFB5F5F8ACEC7ECAAD33E2D1CA4039844BB0B491865` at 107,952 bytes. Exact candidate-origin CORS, `no-store`, visible `nosniff`, identity-encoding GET/HEAD length, GET/HEAD-only behavior and absence of bindings were re-read from the deployed transport. It did not replace the product candidate.

The authenticated one-shot run processed exactly 38 representatives:

- 37 preflight/postflight identity passes and 37 successful bounded body reads.
- One `IDENTITY_MISMATCH` failed before a body request; its cause is not yet resolved.
- Exactly 37 requests, 2,124,313 received bytes and 2,124,313 unique bytes.
- Front-byte magic counts: MPEG-TS 15, ISO-BMFF 8, JPEG 7, GIF 2, PNG 2, WebM 1, WebP 1, unknown 1.
- No Drive mutation, decode, playback, persistent media storage, private identifier publication or resource-key publication occurred.
- The exact redacted aggregate is `qa/v2-07a-bounded-probe/results.redacted.json`.

After the run, the temporary private page context was deleted and the app remained connected and media-idle. The generated local composite bundle and Wrangler account cache were removed; both are disposable/recreatable and neither is committed.

## What this does not prove

- Front magic is not a complete container/index/track parse and does not prove decode or playback.
- `unknown` does not mean corrupt.
- The one identity mismatch is unresolved; no retry or body read has been performed for it.
- iPhone authentication success is not iPhone media playback, token-expiry renewal or sleep/wake proof.
- The probe did not enumerate unrelated service-worker traffic that predated its quiet window.

## Sole READY action

Implement and independently review a zero-body metadata reconciliation for the same freshly recomputed 38-object selection. It must return only fixed aggregate mismatch dimensions, keep every private identity inside the authenticated page, use no Drive mutations and issue no media-body request. Diagnose the single `IDENTITY_MISMATCH` without repeating the 37 successful front reads. Only after that identity unit is closed may V2-07A advance to bounded container/index/track parsing of the already successful routes.

## Verification and recovery boundary

- Redacted-evidence invariants and forbidden-key checks pass inside the adapter suite. All nine recorded Git commits resolve, the fixed sensitive-pattern scan is empty, and the staged evidence blob exactly equals the 3,323-byte worktree file.
- The bounded-core/adapter/transport run passes 108/108; the full nine-file product suite passes 269/269; `git diff --check` passes. Independent rereview is clean after confirming the force-staged ignored evidence artifact is actually present and byte-identical in the index.
- Preserve the current candidate and QA Worker as read-only evidence; do not deploy over production, push, merge or resume automation.
- If the QA transport is no longer needed, deletion is a separate external destructive action and is not authorized by this checkpoint.
- Originals remain read-only. Reconciliation rollback is deletion of its local QA artifacts; no Drive recovery should be necessary because it must perform metadata reads only.
