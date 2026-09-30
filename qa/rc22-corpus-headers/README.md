# Bounded whole-corpus prefix producer

Local QA implementation only. No actual browser/account/device acceptance, product
change, deployment, original/media write or all-corpus completion is claimed.

The producer is intentionally UNBOUND until root binds the fixed candidate23 source.
`binding.json` declares expected version1.22.0-rc.23 and null source pins; the corpus
driver and SW proof reject this before network I/O. After exact candidate source/public
identity is established, root may run `node qa/rc22-corpus-headers/bind-source.mjs <full40SHA>`.
The binder reads committed Git objects, requires version23 in app/sw/version.json, and
embeds their exact SHA256 plus source commit. It accepts no runtime current-version
fallback. Every producer module and inherited source has a build provenance hash.

The generated `sw-proof.expression.js` performs4 static GETs: the maintained runtime
cache/controller discriminator plus exact app.js/sw.js/version.json hashes. It accepts
only the bound version, runtime cache, same activated controller and all3 bound hashes.
It reads no Drive metadata/media. Keep its handle page-local and pass it to the cohort
facade; do not replace it with a version-only proof.

## Page-local invocation and smallest next actual cohort

Evaluate and retain the factory function once in the private lexical QA context. The
same factory instance owns its continuity registry across cohorts. Use the exact private
context `{accountKey,generation,rootId,priorityFileId}` already independently resolved
from the current exact-named priority file and unique current parent folder. Preserve
the signed-in app's normal idle owner; Q1 must be absent and retirement settled.

The facade signature is `(privateContextText,swProof,priorCapsule=null,options)`.
The smallest useful next cohort is `{phase:'representatives',maxFiles:8}` with no prior
capsule. It orders the current priority first, largest representative next, then rare
representatives and remaining deterministic IDs. This includes them in prefix inspection
instead of v2's old deferred-largest track policy. It uses at most8 media GETs/7520
bytes plus16 exact file-identity metadata GETs and the maintained before/after inventory
envelopes. The successful actual v3's124 GETs were its four inventory passes, not an
assumed old68-GET first-envelope figure; the new reservation derives from its own run.

Read only `job.poll()` to obtain a safe summary. After done, retain `job.continuity()`
privately without serializing it. Pass that opaque handle as the third argument of the
next call. Suggested progression: finish `representatives`; then `videos` for the true
unique MIME-video OR video-extension union; then explicit revalidation phases as needed.
`maxFiles` can be1..64, with serial internal sub-batches of at most8 operations. Increase
from the first8 only using actual inventory duration, remaining reserve and cohort cost.

## Maintained contracts and budget

Each cohort runs the maintained complete recursive inventory twice before and twice
after, then compares exact private inventories. Representative selection is maintained.
The video union is deduplicated by content object and shortcut target, includes video
MIME or .mp4/.mov/.webm/.mkv/.avi, and never adds overlapping aggregate counts.

Each new eligible file receives exactly one `bytes=0-939` media GET through the actual
same-origin SW media URL. The existing bounded core validates exact206/Range/Length/body,
serial I/O, generation, abort and cleanup. Preflight/postflight metadata must match the
current inventory identity and a usable headRevisionId or SHA256 checksum, then agree
with each other. No sample tables, track metadata, packets, deep ISO/EBML parsing or
decoder capability are inferred. Returned prefix copies are cleared after sniffing.

Known size<=940 is ineligible because an exact940 prefix would read the whole object.
Blocked/unknown download capability, unsafe size and missing identity are counted
separately as ineligible. Unknown valid signatures remain unknown; an error payload is
failed. Invalid protocol and postflight identity are failed, with no admitted proof.

There is one shared512 metadata GET/64MiB aggregate/2MiB-response/10-minute ledger per
cohort. Per-file64 GET/2MiB+8192 bytes/1MiB request/50s/10s headers and no-progress caps
are unchanged. Sub-batches cannot reset either ledger. Final inventory reservation is
the observed first two-pass requests/bytes/time times1.25 with small fixed margins;
no new file starts without space for that reserve and a full per-file time budget.
The reserve is an estimate, not a guarantee: a larger or slower final inventory fails
honestly under the same caps. Cleanup rejection remains terminal and upstream cleanup
remains unknown. Metadata reader locks/buffers are released even when cancellation fails.

## Continuity and renewal

The opaque WeakMap capsule stores only exact private file/content identities, known
signature class, deeper-metadata-not-probed and a validation evidence epoch. It stores
no token, media body, URL, page token, active transport, live app state, controller or
Q1 owner. The epoch uses existing auth/Drive/token revisions, expiry, actual source/media
generation and an opaque controller ordinal; it creates no Q1 generation and changes
no product state. Every new cohort acquires its own fresh strict idle owner and full
metadata baseline. Different account/root/source binding rejects the capsule; changed
or absent catalog identities discard the corresponding prior proof.

Proofs from the unchanged validation epoch and exact current inventory identity can be
carried as that epoch's admitted immutable signature evidence. Natural token/owner epoch
change makes old proofs historical-pending. They may suppress duplicate prefix reads,
but are not counted as currently validated. This distinction avoids an O(N) metadata
revalidation on every growing prefix cohort that would stall near the512-request cap.

`revalidate-representatives` or `revalidate-videos` performs at most64 fresh immutable
metadata checks, in at-most8-operation serial batches, with zero media. It admits matching
historical records into the new epoch; changed head/checksum discards them and marks a
failure, requiring a later prefix read. Other historical records remain retained and
publicly pending. Renewing again invalidates their current-epoch admission again; do not
report current whole-video coverage unless the returned denominators justify it. If a
large corpus cannot fit revalidation inside stable owner windows, that is an unresolved
feasibility limit, not authority to raise caps or silently rebind a token.

Clear obsolete opaque handles with `factory.clearContinuity(handle)` after carrying a
new one; retaining the new handle is optional. Reloading or reevaluating the factory loses
the registry and exact continuity, so never reconstruct it from aggregate public counts.

## Summary semantics

All output is redacted: safe inventory counts/categories/pages/bytes, anonymous slots,
fixed signature/failure codes, request/byte metrics and numeric coverage. No file IDs,
names, content hashes, raw bytes or unknown MIME/extension text are exposed.

For the selected pool: denominator = classified + failed + ineligible + unattempted.
`historicalPendingRevalidation` is a subset of unattempted. The header prefix, unknown
signatures and deeper metadata counts are independent. `complete` means this bounded
cohort finished its inventory comparison and reconciled dispositions; it can still have
failed/ineligible/unattempted rows. `wholeCorpusComplete` is always false. Larger cohort
completion, final current header coverage, codec/decode/device and full CORPUS06 remain
separate goal gates. Eight files are a savepoint, never a whole-corpus stopping criterion.

Build: `node qa/rc22-corpus-headers/build.mjs`.
Verify: `node qa/rc22-corpus-headers/verify.mjs`.

## Current binding24

Root preserved all19previous bound23 files in bound23-preparation/ before the exact candidate24 binder replacement. Current binder requires version24 in committed app/sw/version.json and exact full40SHA; no runtime fallback. The original UNBOUND preparation and bound23 historical results remain separate.
