# Normal account-state transport — 2026-09-28

Implementation and synthetic verification complete; candidate delivery and actual
normal-runtime/fresh-execution acceptance are pending in this record's first cut.
D-059 resumes WP-08 before the newly queued UI work. D-050/D-051 still govern
external authority. Production v1.21.0, general Drive mutation lock and paused
automation are preserved.

## Responsible layer and preservation

The candidate's general mutation gate also rejected normal appData sync with423.
rc.11 adds a separate state-write setting. Only the canonical producer's private
Symbol capability, matching ready account/writer, official upload URL and own
PATCH ID can pass it. Ordinary files, other writers and legacy are not writable
through this capability. The Worker remains an authentication owner, not a Drive
or media proxy. Its general writes setting stays false.

CREATE reserves one server-generated appData file ID per account/writer, stores
and rereads it before dispatch, and reuses it after response loss, catalog lag or
reload. Google documents appDataFolder ID generation and same-ID CREATE409 rather
than another file: [generateIds](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds),
[create-file guide](https://developers.google.com/workspace/drive/api/guides/create-file).
No full replay journal or extra dependency is needed for this normal writer path.

Each POST/PATCH is dispatched once by driveFetch. A separate metadata/body GET
must prove own name, appData space and a valid full state that dominates the fixed
submitted payload before success. A concurrent local revision remains queued.
PATCH404 rechecks the complete catalog before considering CREATE and merges the
fresh writer union. Unknown schema, incomplete/malformed/duplicate catalog, missing
writer body and invalid/unsaved local cache preserve state and block writes.

## Verification and recovery

- Observed actual read-only preflight on rc.10/product8187121:11GET,7documents/
  6writers, remote9liked/48unliked/133viewed; candidate9/48/140 remains pending.
  The prior old-origin7/48/119 baseline is included with a distinct writer.
- Fourth private recovery envelope was saved, flushed, fully reread and rebuilt
  with actual product merge. Exact executed producer provenance is recorded in
  qa/v2-state-normal-sync/preflight-results.json; private names/IDs/hash/body are
  omitted. Its scope does not claim a fresh live SW VERSION or Console audit.
- Directory ACL remains current user/SYSTEM/Administrators only; private tracked
  files0. Retain all four files and the earlier QA confirmation journal during
  cleanup. These backups are not encrypted.
- Ten focused actual-app/driveFetch/provider tests cover scoped gates, stable-ID
  response-loss/reload, durable reservation, cache/catalog/schema failures,
  PATCH404, fixed payload/readback, local follow-up, stale owner and writer union.
- Related suite157/157 and final full product suite368/368 pass. Initial full run
  had367/368 because the pinned static release expectation still saidrc.10; the
  test pin was updated to rc.11 and the failure output is retained separately.
  App/SW syntax and diff checks pass. Independent gpt-6-sol/medium review found
  no material issue in this scoped transport/version change.

Synthetic tests are not real-account, two physical devices, sleep/wake or iOS
proof. Those acceptance rows retain their distinct evidence scope.

## Next exact unit

Commit the verified candidate product, materialize allowlisted bytes from that
commit, deliver only the free isolated candidate, then observe ordinary same-
account sync and independently compare the full remote union/other writers.
Fresh execution/cache reconstruction and rollback compatibility remain separate
checks. New cursor/overlay/loading/UI requests stay queued after core continuation.
