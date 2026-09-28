# Private recovery backup preparation

QA only. This prepares and verifies recovery data for the already authorized
same-account non-destructive migration. It performs no mutation, storage write,
encryption, download, credential change, or sink selection. Root owns live
identity/owner wiring, capture execution and the private sink. Product schemas,
writer ownership and conflict semantics are unchanged.

`backup.mjs` imports the maintained snapshot collector/comparator and legacy
comparator. Inject the actual `normalizeAccountMediaState` and
`mergeAccountMediaStates`; the tests execute those functions from current app.js.
Remote material is the collector's complete **parsed raw JSON** and metadata,
including every writer and legacy document, unknown benign extension fields,
schema-less legacy shape, writer/file identities, tombstones and timestamps.
Remote HTTP whitespace/byte formatting is not retained by that collector.

## Private input and output

`createRecoveryBackup` accepts an approved `remoteSnapshot`, a separately captured
`legacyLocal` from `readLegacyReplica` with writerRead=true, and candidate:

```js
{
  accountId,                 // Drive about.user.permissionId, not auth HMAC
  cacheText,                 // exact account-localStorage value, including whitespace
  runtimeProjection,         // state.accountMediaState only, never whole state
  pending,                   // actual merge(remote, cache) differs from remote
  writerId,                  // current app writer; do not call a creating accessor here
  writerStorageText          // exact writer-key value or null; may differ without locks
}
```

Candidate cache must be present and schema-valid; absence is not empty-state
success. Runtime must equal the actual merge of remote and cache. Local pending
state remains separate from the remote snapshot. Legacy cache and writer remain
separate and are not copied into candidate storage or merged into the recorded
runtime. A legacy inclusion=false result can still be backed up and faithfully
recovered; it does not become a migration success.

Optional `evidence: {projectClientBinding: 'verified' | 'unknown'}` is supplied
coordinator evidence, default unknown. Neither account equality nor origin names
establish that Google project/client relation. The helper checks this metadata's
shape but does not verify Google Console facts. Transferred stable/repeated-read
flags likewise require approved capture provenance; no branding/signature scheme
or malicious-caller security authority is introduced.

Return value is `{privatePayload, summary}`. **Only summary may be printed.**
Private payload/text contain account IDs, file/writer/media IDs and raw state.
Never include them in tool outputs, public reports, logs, Git, cloud exports or
model prompts. Root decides any narrowly scoped local private sink and staging
exclusion. No credentials, tokens, cookies or original media are requested.
Control-field whitelists reject whole app/auth/provider objects, and known
credential property names are rejected in state extension objects. Media IDs
named `token`/`cookie` remain legitimate IDs. This is not arbitrary-secret
discovery inside opaque strings: callers must supply state-only data.

`serializePrivateBackup(payload, {expectedAccountId, normalize, merge, isCurrent})`
returns private JSON text only after validation. After root saves and rereads it,
`verifyRecoveryReread({original, rereadText, ...rules})` validates both structures,
recomputes remote union/candidate reconstruction/legacy inclusion and compares
the entire recovered payload against retained original evidence. It returns
aggregates only. Outer JSON formatting/order can differ; embedded exact cache
text, document values, identities, metadata, evidence and timestamps cannot.
This is not an echo check against a reread's own contents.

## Collector and browser factory

`captureRecoveryBackup` accepts injected `read(url, {method:'GET', signal})`,
`readCandidate()`, `legacyLocal`, expectedAccountId, normalize, merge, isCurrent,
clock, signal and the existing collector limits. It reads candidate before/after
the strict complete remote capture and rejects any changed cache, writer,
projection/pending or supplied legacy raw data. Keep the existing approved
same-account/generation/controller/lifecycle guards in `isCurrent`; write sync
must be absent. Benign account loading alone is not a veto when these owners and
exact local evidence stay stable. No visibility/online/token/clock manipulation
or poll suspension is performed here.

`await buildRecoveryBackupFactory()` returns deterministic public source using
the already installed esbuild, with no emitted files or new dependency. Evaluate
that expression to obtain a factory, then inject the above dependencies from the
authenticated app lexical runtime. The factory introduces no global bindings.
Keep its result as a private remote handle:

- `await handle.capture()` and `handle.safeSummary()` return only safe aggregates/fixed errors.
- `handle.readPrivatePayload()` / `handle.readPrivateText()` are **private methods**
  for root's remote-handle transfer to the designated sink; never display results.
- `handle.verifyReread(privateText)` returns aggregate equality evidence only.
- `handle.clear()` releases retained payload and cancels pending capture. It
  cannot erase private copies already transferred to the caller/sink.

One handle captures once. Errors retain no partial payload, provider error bodies
are not consumed by the collector, and capture guards are rechecked after reads.
All success counts/booleans describe evidence, not an independent write authority.

## Limits and remaining boundaries

Existing collector limits: at most 100 GETs, 8MiB consumed responses, 30 seconds,
64 files, 16 catalog pages and one concurrent-change retry. Payload/reread JSON
is capped at 32MiB UTF-8; exact local cache texts at 8MiB each. Traversal is capped
at depth16/300,000 nodes and rejects lossy/non-JSON inputs. Caps are not a claim
about total network bytes, browser RSS or the private sink's durability. Synchronous
serialization/validation is bounded by these data caps, not the collector timer.

The helper does not verify sink durability, perform restoration, or authorize a
write. A fresh capture is not a remote lock or submission-time snapshot; owner
and remote catalog changes need a new pre-submit discriminator. No physical
device, two-device convergence, writer-submit/readback, rollback-runtime or
release acceptance is claimed. Empty baselines are rejected by default; the
pure supplied-snapshot API permits the existing explicit empty approval contract,
while live capture does not opt into empty baselines.

Run focused synthetic verification:

```text
node --test qa/v2-state-recovery-backup/backup.test.mjs
```

## Actual rc.10 execution

Root's `runtime-facade.function.js` injects the actual authenticated product
functions with native GET-only transport and account/token/revision/controller/
media/cache/writer/lifecycle guards. The trusted collector validates appData
family metadata before body dispatch; the facade alone is not an arbitrary-ID
authorization interface. `quiescent-capture.function.js` reuses the maintained
30s timer reservation wrapper and clears private payload before its finally
restores timers. It does not change credentials or the global write flag.

`live-rc10-results.json` records safe aggregates and exact executed sources.
Actual10GET/51024bytes/0retries captured six documents; one new102758-byte private
envelope was exclusively created, flushed, completely reread and compared against
retained original using actual app merge. Restricted ACL/ignored/tracked0 verified.
Private data is only under ignored `private/`; keep it through cleanup, as Git does
not recover it. See `memory/STATE-RECOVERY-20260928.md` for scope and limits.
No appData write/runtime restore/fresh-origin/device acceptance is claimed.

Separate facade integration checks passed8/8 without rerunning passing helper11:

```text
node --test qa/v2-state-recovery-backup/runtime-facade.test.mjs
```
