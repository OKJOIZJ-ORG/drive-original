# Bounded pathway from metadata denominator to whole video header coverage

Status: proposed execution design, not an implemented or executed all-media driver.
The v4 producer measures current metadata denominators only. Actual v2 processed8
planned samples and97 media GETs but did not finish the final inventory; this is not
CORPUS06 completion. Sample3 remained ISO_HEADER_INCOMPLETE, unknown/TS cases remained
unqualified, and no codec rejection can be inferred from a bounded parser limit.

## Evidence phases and exact denominators

1. Run v3 metadata-only while idle to distinguish original failure from cleanup failure.
   Run v4 metadata-only to expose the maintained before/after metadata counts, two-pass
   pages, category counters and bytes. Both preserve4 full inventory passes in total.
2. Establish a new private, page-local baseline using the maintained inventory and
   selector. Prefix every current representative (observed36; use the current count,
   never hard-code36). Include the exact current priority and largest video; v2's
   deferred unproven-largest policy is specific to its8-track sample, not an exclusion
   from the later representative prefix phase. Read at most940 bytes and at most one
   prefix media GET per eligible object. Never read an entire object: size<=940,
   missing identity/size, blocked/unknown download capability, inaccessible resource
   key, and non-safe integer size are separately counted as ineligible/unprobed.
3. Reuse prefix classification to select bounded deeper metadata combinations:
   all rare MKV/AVI cases, MIME/extension mismatches and unknowns, incomplete/failed
   ISO/WebM cases, and the least-common observed container/structural codec groups.
   Exclude a previously proved object only with revalidated exact private identity.
   For ISO, retain current top-level caps and coalesced sparse moov bounds; sample3's
   scanner limit/incomplete result needs its own redacted discriminator before any
   cap change. For TS, do not replay deep continuation merely because metadata says MP4.
   For EBML and other containers, keep the existing parser limits and explicit unknowns.
4. Build the whole video-candidate set privately from unique classified objects,
   resolving shortcuts exactly as the maintained inventory/selector does. Membership
   is video MIME family OR one of .mp4/.mov/.webm/.mkv/.avi. A video extension can be
   metadata-mislabeled; an unknown video MIME can lack a known extension. The union
   must use IDs privately, rather than adding v4's two overlapping counters. Queue the
   as-yet-unread union members in deterministic batches of at most8 files. Count
   MIME-video and extension-only candidates separately, and report their true union.
5. Reconcile the final full metadata inventory against the private baseline and every
   admitted exact identity. Publish denominator and header-only coverage separately
   from track metadata, decode, playback, hardware, and performance qualifications.

Required count invariants for each set: denominator = validatedPrefix + attemptedFailed
+ explicitlyIneligible + notAttempted. `attemptedFailed` includes fixed protocol/timeout/
identity failures; parser-incomplete after a valid prefix is a separate deeper-metadata
failure and does not erase a legitimately validated signature. Do not count stale,
cancelled, no-postflight or owner-rejected reads as admitted current evidence. Every
coverage number must say which set, current inventory and evidence level it refers to.

## Batches, inventories and allowance bounds

Use the existing bounded reader for each file: one exact prefix GET through the actual
same-origin SW media URL, exact preflight and postflight file metadata with content
validators, generation/abort guard, exact206/Range/body validation, and cleanup.
Keep64 requests/file, 2MiB+8192 bytes/file, 1MiB/request, 50s/file, 10s headers/no-progress;
a prefix batch is strictly cheaper than those maxima. An8-file prefix batch normally
costs8 media GETs/at most7520 bytes plus16 metadata identity GETs. Returned media
buffers are cleared after sniffing and contain no transport credential.

Do not place four full inventory passes around every8-file batch. The observed full
before+after shape is roughly136 metadata GETs;36 prefixes in five such jobs would
spend roughly680 list/root/account GETs before72 identity GETs. A bounded cohort can
instead contain one maintained two-pass baseline, several at-most8-file batches, and
one maintained two-pass final inventory. It has one shared metadata/byte/time ledger
and strict owner for its complete lifetime; nested batches do not reset those caps.

Start the first cohort at the representative count (observed36), with no more than64
prefix objects per later cohort. At the observed68-GET two-pass inventory shape, a
64-object cohort needs roughly136+128=264 metadata GETs and64 prefix media GETs;
this fits the existing512 metadata cap arithmetically. 64 is a proposed upper bound,
not a mandate or measured feasible size. Charge any continuity revalidation GETs to
the same512/64MiB ledger. If a changing inventory exceeds the estimate, stop without
more reads; do not waive budgets or omit the final inventory. Keep a10-minute cohort
deadline and reserve time/requests for its final inventory. Choose a smaller batch or
cohort from actual first-batch latency and remaining deadline, not from byte size alone.

No whole-video run is feasible merely because its bytes are small. If the union has V
eligible unread objects, the minimum prefix cost is V media GETs and2V file-identity
GETs, plus baseline/final inventories and explicit continuity validation. Estimate
wall time from the actual first prefix batch and v3/v4 inventory timing. Record V,
eligible/ineligible counts, GETs, actual duration, retries (if independently justified),
and remaining work. A small unknown representative set cannot stand in for V.

## Natural credential renewal and private ownership

Run idle corpus QA only after the natural-renewal player is closed, with Q1 absent,
retirement settled and normal idle ownership. It must never share a playing Q1 owner.
Existing token/account/controller/projection/writer/session/source guards stay frozen
through a cohort. A token revision, account abort, controller change, backgrounding or
other owner change ends that cohort; do not silently replace its owner or credential.

A coordinator may keep a separate opaque continuity capsule in its page-local lexical
closure containing only private catalog identity, per-object expected identity/content
validators and accepted classification evidence. It holds no tokens, response bodies,
Q1 generation, playback owner, active reader or fetch transport. Do not export it to
tool output, storage, URLs, app globals or Drive. Closing a child job releases its own
readers, cache, credential and listeners. The capsule is not a background scheduler.

After natural renewal, acquire a fresh idle owner and run a new maintained two-pass
inventory. Compare its exact private account/root/catalog rows with the capsule.
Changed objects invalidate that object's carried evidence; account/root mismatch
invalidates the capsule. Before counting prior reads as current continuity, revalidate
their full file identity plus headRevisionId/checksum via fresh metadata and charge it
to the new cohort's budget. Preserve historical failed/aborted cohort counts separately.
If exact private continuity is unavailable, report unknown and rerun the bounded prefix
for that row. Fresh ownership is never simulated by minting a Q1 generation or token.

Whole video header completion requires a final stable denominator and a classified,
ineligible or explicitly unresolved disposition for every union object; unresolved
items cannot be called qualified. Full CORPUS06 still retains the additional codec,
format, original byte preservation, device and playback requirements owned by the goal.
