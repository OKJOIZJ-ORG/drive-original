# Restricted canonical own-writer persistence QA

One already authorized same-account migration CREATE while global
`DRIVE_MUTATIONS_ENABLED=false` remains unchanged. No normal product sync/UI or
general Drive mutation capability is enabled. Root owns live execution and the
private backup/journal, runtime facade and quiescent-window producers.

`buildOwnWriterFactory()` returns deterministic public source. The three current
app.js functions `flushAccountMediaState`, `createAccountStateFile` and
`updateAccountStateFile` are appended and executed byte-for-byte after bundling.
Dependencies live in a shadow closure: cache/presentation/retry/queue operations
cannot modify actual runtime/storage or start automatic retries. The existing
candidate writer ID is reused without UUID creation or old writer copying.

The actual writer Web Lock surrounds strict complete capture, exact disk-backup
remote comparison, one POST and independent complete raw readback. Transport
checks canonical own-name appDataFolder multipart and exact maintained merge,
including unlike tombstones and viewed timestamps. Other writer/legacy raw JSON
and metadata must remain unchanged. Native POST response status is evidence only;
its body is cancelled and metadata is derived from the independent readback.

An injected private journal must confirm/reread `attempt_claimed` before fetch
and `confirmed` only after independent raw reads. Canonical flush swallowing an
error is not success: the executor rethrows shadow sync errors and stale ownership.
Lost/error responses permit read-only reconciliation, never a second CREATE.
Missing/duplicate/malformed/changed readback or failed confirmation journaling
stays `submission_uncertain` after any dispatch. Keep the durable attempt record
for later same-account read-only reconciliation rather than starting a new job.

Root facade requires native Web Locks, >60s credential margin, no existing
attempt key, matching candidate storage writer and all identity/revision/cache/
projection/controller/media/lifecycle fences. Benign loading alone is allowed;
active write sync is excluded. It persists only its exact QA journal key. Native
GET URL policy relies on the reviewed collector for catalog-derived appData body
IDs; native POST policy relies on the reviewed helper for exact multipart/body
authority. These private closures must never become general UI transport APIs.

Public `run`/`poll`/`safeSummary` return fixed codes and counts/booleans only.
`privateJournal()` contains private IDs/raw state; root alone transfers it to its
designated private sink. Never print/export it to tool output, Git, cloud or model
prompts. Headers, credentials, whole auth objects and original media are excluded.

One helper run has a shared maximum54s deadline, abort-bounded lock/dispatch waits,
and sticky one-attempt ownership. Each strict snapshot retains the maintained
100GET/8MiB/30s/64files/16pages/one-retry limits; those are per-capture limits, not
a claim of100GET across both captures. Root's explicit55s quiescent reservation
restores eligible normal refresh in finally. These tests do not execute that live
reservation, real Chrome/Drive, private files or production writes.

Focused offline verification:

```text
node --test qa/v2-own-writer/migration.test.mjs qa/v2-own-writer/runtime-facade.test.mjs
```

The quiescent bridge accepts **private JSON text**, parsed in the target realm.
Do not send nested backup objects through a transport that drops null properties:
required `writer:null` and schema-less legacy metadata must survive unchanged.
`transfer.test.mjs` reproduces omitted-null rejection without weakening validation,
checks exact text/input fidelity and benign null extensions, and executes the
actual bridge/window with synthetic timer/job spies. Construction/run/poll errors
retain fixed public failures and finally restoration/clear; unavailable post-job
counts remain unknown rather than invented zero. Run this boundary separately:

```text
node --test qa/v2-own-writer/transfer.test.mjs
```

Tests execute the deterministic factory, exact current app function text and actual
normalize/merge. They distinguish successful merged persistence from lost response,
no apply, malformed readback, journal failure, stale owner, cancellation and hanging
dependencies; root-facade tests additionally verify lock/native fetch/storage wiring
and listener cleanup. Fake Web Locks/provider/storage prove integration contracts,
not browser durability or live success. No atomic remote lock, normal flag-enabled
sync/UI, fresh-origin reconstruction, two-device, rollback or release acceptance is
claimed by this restricted CREATE unit.

The actual rc.10 run is closed in `live-rc10-results.json` and
`memory/OWN-WRITER-20260928.md`: one canonical POST, initial readback catalog403,
then a later complete read-only capture confirms the exact own body and all six
older raw documents/metadata unchanged. Remote union is9liked/48unliked/133viewed;
candidate pending=false. No CREATE replay occurred. Confirmation came after the
original Web Lock was released, so the failed same-lock result remains recorded.
All21 distinct focused checks pass; private recovery and journal remain outside Git.
D-058 closes this unit and requires WAIT before starting any next work.
