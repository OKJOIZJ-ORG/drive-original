# Normal account-state transport — 2026-09-28

Implementation, candidate delivery, actual normal sync and reconstruction are
verified within the scopes below. Actual multi-device/mobile gates remain separate.
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
  test pin was updated to rc.11 and the original failure output is retained as
  full-node-first-version-failure.txt.gz without changing its bytes. Raw spacer
  whitespace had failed the staged format check; compressed preservation removes
  that artifact-only conflict. Source and test line endings are materialized
  from the staged Git inputs before the final368/368 run and hash verification.
  App/SW syntax and diff checks pass. Independent gpt-6-sol/medium review found
  no material issue in this scoped transport/version change.

Synthetic tests are not real-account, two physical devices, sleep/wake or iOS
proof. Those acceptance rows retain their distinct evidence scope.

## Actual normal-runtime exit — 2026-09-29 KST

Candidate rc.11 was delivered from fixed source b9d873926e894bb89a9faa8e638f7f0a80c0eb7e,
Worker fe556d43-9251-40c7-82bf-d138f35ebccd. Public19files/cache17 match Git;
cold anonymous shell/offline smoke/private404 pass. General writes remain false;
only own account-state producer writes are enabled. Production was not replaced.

Actual same-account Chrome initializes without423. A separately retained complete
read-only11GET capture finds7documents/6writers, remote and candidate9liked/
48unliked/140viewed, pendingfalse. Own writer is unique and its entire normalized
body equals the preflight expected projection. All6other raw bodies and metadata
are unchanged; legacy7/48/119 remains included. The native normal mutation count
was not captured: the Network event buffer was empty/truncated. A first awaited
readback hit the CDP3s timeout and has no retained result; acceptance uses the
separately retained second capture, not a guessed outcome from that first call.

The fifth protected270440-byte recovery envelope was flushed, fully reread and
reconstructed by actual product merge with whole-original equality. Folder ACL
and private tracked0 were checked. Keep all5JSON envelopes, the deployment log,
and the private actual-reload screenshot; backups are not encrypted. Browser
private payload references/object groups were released after persistence.

Actual app reload restores the same9/48/140 with online credential and no pending
sync/error. This retains the real cache. The separate empty-cache runtime uses
the exact complete app.js SHA8b1dfbaee12eefbd03f88aec03b1aaa4c0b984b47205fed780078f256e5670bb,
inert UI/empty storage and read-only actual-owner adapter:9GET/61085bytes/7docs,
full private remote projection equality, writes0, actual cache/writer unchanged,
all timers/listeners cleared. Its first attempt stopped after1GET/0bodybytes on
an owner fence; exact failed producer/result retained, cause unknown. The next
run passes with identical protection conditions plus fixed-name guard diagnostics.
Local fresh factory6checks and facade5checks pass, including foreign requests,
same-count/different-ID comparison, cancellation and ownership changes.

Exact production v1.21.0/e08989a code also restores the full protected rc.11 state
in an isolated empty-cache local provider:9providerGET/0network/0writes. Its older
catalog field allowlist is explicitly pinned in the QA wrapper; product source
is untouched. This verifies read/schema compatibility, not a production rollback
deployment. See live-rc11-results.json, fresh-cache-live-results.json and
rollback-schema-results.json in qa/v2-state-normal-sync/.

These results do not prove a new-origin OAuth flow, two physical devices, iOS,
offline live propagation, or a stable atomic remote transaction. The actual app
reload screenshot is private evidence; the local report is a redacted QA record,
not product UI/device proof. A file-URL report preview was policy-blocked and no
alternate protocol workaround was attempted; the existing actual candidate was
captured with the supported CUA screenshot API after CDP screenshot timeout.

## Next existing core unit

Run the prepared rc.11 metadata-only two-inventory comparator for A-012. Preserve
the historical collapsed cause as unknown. New cursor/overlay/loading/general
UI requests stay queued; do not start them in place of existing core work.

The exact whole-app factory contains3inherited whitespace-only source lines. Its
plain copy remains ignored locally; the committed gzip round-trips byte-for-byte
to the actually executed producer (archive JSON pins both hashes). The builder
regenerates both without trimming/changing product text. Staged format check
passed after this archival correction; no product/test condition was weakened.
