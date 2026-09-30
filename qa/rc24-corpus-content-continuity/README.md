# Bounded content continuity — fixed rc.24 QA producer

This is a new private prefix classifier. Existing rc22 producers, bound23/unbound preparations and actual results remain unchanged. Product, shared memory/specs, browser state and Drive media are outside this unit.

## Acceptance and causal correction

CORPUS-06 (implementation pack lines1076–1084) requires complete inventory, feasible whole-video bounded probes, explicit budget omissions and separate representative device playback. It does not require observations within one credential lifetime. Q0-PRODUCT-20260929.md:7 explicitly preserves an immutable pin across credential renewal and worker restart.

The former `validationEpoch` admission rule treated credential change as content change. This producer retains acquisition `evidenceEpoch` privately but admits a prior successful prefix when a fresh complete catalog has the same nonempty normalized Drive file version, account, file ID, size, modified time, MIME and current `canDownload:true`. Prior records must already contain admitted pre/post usable head revision or SHA256 proof. Account, canonical root, fixed source commit/version and all three source hashes must match the capsule binding.

Drive documents `files.version` as monotonic and covering every server-side change; `headRevisionId` identifies a binary file's head and SHA256 is available for stored binary content. Source: https://developers.google.com/workspace/drive/api/reference/rest/v3/files (version/head/checksum). This is conservative use of the provider version contract, not a fresh checksum/head lookup. Maintained list fields do not include head/checksum. A checksum-only change with an unchanged version would contradict that provider contract and cannot be detected through current list fields.

Changed or missing version, changed compared identity, lost capability or catalog disappearance removes only affected carried proof; eligible changed files receive normal bounded preflight/prefix/postflight. A metadata-only server version change can cause an unnecessary prefix recheck. Optimizing that case with delta head/checksum reads is deferred; no field expansion or cap increase is included.

## Fences and limits

Request ownership and cleanup code is inherited unchanged: strict active account/auth/token/controller/source/retirement/foreground/projection/writer fences; active renewal cancels the cohort; successors capture a fresh idle owner. No stale owner/token rebinding occurs. Capsules contain private identity/content/signature/provenance facts only, without credentials, live owners or bytes. Capsule creation requires the final full catalog comparator and successful cleanup. It is available only through the same evaluated factory instance's opaque handle. Older factories' handles are deliberately not imported.

Each cohort keeps ≤64 files in ≤8 serial batches, shared512 metadata GET/64MiB/10min limits and observed final-inventory reserve. Per-file64GET/2MiB+8192 bytes/1MiB request/50s deadline/10s headers/no-progress remain. Reads are exactly `bytes=0-939`; no full-object, mdat, index or speculative body reads. Fresh full inventory still traverses the entire catalog and reconciliation compares private rows; renewal adds no per-file metadata requests for previously probed files. The reserve is an estimate, not a completion guarantee.

Public results distinguish `carriedImmutableByCatalog`, `freshPerFileChecked`, `freshHeadChecksForCarry:0` and explicit carry evidence. `evidenceEpoch` remains the acquisition epoch for carried records. Denominators preserve failed/ineligible/unattempted/unknown signatures. Deeper metadata stays unprobed; `wholeCorpusComplete:false` remains. These are 940-byte signature facts at a catalog envelope, not codec, decode, playback or a transactionally atomic Drive snapshot.

## Actual next step (root-owned)

Binding is fixed to `1.22.0-rc.24`, commit `8a2894ee2c7aa85c9cb2ff992879f4580e15e2e7`. Check the generated SW proof, retain the evaluated factory locally, then begin a fresh registry with `{phase:'representatives',maxFiles:36}`. Subsequent `{phase:'videos',maxFiles:64}` cohorts receive only this factory's prior successful `continuity()` handle. Store no tokens, private context, handle internals or media in output. Clear the handle with `factory.clearContinuity(handle)` when done.

Inherited `revalidate-*` options perform no work for catalog-admitted records; normal representative/video phases are the supported progression path. Stop before a separately owned natural-renewal observation and resume under a fresh idle owner afterward. Old actual results remain separate; preparation does not prove actual multi-renewal completion.

## Local verification

Run `node qa/rc24-corpus-content-continuity/verify.mjs` from source. Focused tests exercise500 files across8 credential renewals, no growing per-file revalidation traffic, version/missing/capability/disappearance/root/account/source/hash counterexamples, active cancellation, ranges/budgets/cleanup, privacy and generated source proof. The139 prior maintained contracts are reused only after their imported hashes match rc22 provenance and their TAP hash is preserved; they are not rerun or reported as new checks. Delivery paths are enumerated in `curated-savepoint.json`. No commit/deploy/browser run is performed here.
