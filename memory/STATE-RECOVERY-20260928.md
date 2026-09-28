# Recoverable private state backup — 2026-09-28

Observed on unchanged product8187121/app1.22.0-rc.10,
Worker85904e0a-ba28-4939-95d1-1375a626339b. D-050/D-051 authorize this
non-destructive same-account preparation. Global Drive writes remain false.
No appData or original-file mutation occurred in this unit.

## Capture and reconstruction

The maintained complete collector captured six remote documents: one legacy
document and five writers, including complete parsed raw JSON and metadata.
Before/after account/catalog checks pass. Native transport10GET, consumed
responses51024bytes, retries0; scoped helper counts, not whole Chrome/upstream.
Remote HTTP whitespace is not preserved.

A fresh inert legacy version.json tab provedv1.21.0/no scripts and read the
10303-byte exact local cache and writer twice under the candidate account fence.
Candidate exact cache/writer text, runtime projection and pending state remain
separate from raw remote data. No old writer UUID was copied.

| Captured projection | Liked | Unliked | Viewed |
|---|---:|---:|---:|
| Remote union | 8 | 48 | 130 |
| Candidate | 8 | 48 | 133 |
| Old-origin local | 7 | 48 | 119 |

Actual product normalize/merge confirms old-origin inclusion, distinct writers,
candidate pending state, and runtime equal to merge(remote, cache). Legacy writer
is visible in the fresh candidate appData catalog; candidate own writer is absent.
This proves that visibility, not an independent Google Console project/client audit.

Existing controlled30s quiescent window held this page's state timer reservations,
waited existing owners, captured within15925ms and restored refresh in finally.
Sync/retry reservations were absent. Backup job cleared payload before restoration.
After restoration, account/writer/exact cache/runtime projection/controller guard/
readiness/idle/writes=false pass. Credential and clock ownership were unchanged.

## Private recovery sink

One new102758-byte JSON envelope is saved in the ignored
`qa/v2-state-recovery-backup/private/` directory. Exclusive wx creation, write,
sync, close and full reread pass. Complete envelope equality, inner hash equality
and full structural/canonical comparison against retained original evidence pass.
The comparison uses actual app.js normalize/merge in an offline VM; isCurrent=true
represents immutable captured evidence, not live submission freshness or a lock.

Directory ACL inheritance is disabled; only current user, SYSTEM and Administrators
have access. File inherits only those three principals. Git ignore resolves to
qa/*/; tracked private files0. Private envelope includes account/file/writer IDs,
raw state and configured OAuth client ID from local Worker configuration.
Actual Google project/client relation remains unknown. No access/refresh token,
cookie, whole auth object or original media. It is not encrypted. Keep this file
during workspace cleanup; Git cannot recover it.

Private hash, filename, IDs and payload are absent from public reports/commits.
Browser remote backup group and transferred private references were released;
the file remains. Logical release does not imply secure erasure/native RSS recovery.

## Maintained producers and verification

`qa/v2-state-recovery-backup/live-rc10-results.json` pins safe aggregates, exact
producer hashes and post-restoration results. Executed factory SHA
035f6482b2cbe3730c14412fa5bcd56915f87e0bcf3684c25eece336281449bb;
runtime facade319d8c62616e72400b70fae16f3aae933f7c8391d15436ded935b79af8856b91;
quiescent bridge5811a2aaafb9118a2fc0760da2e217a1e86a97f3a1107a61ffaed6ae9c0fc777.
Reused legacy reader/timer wrapper hashes are recorded. Actual app source
43ba2889b349c29e35e6075600d09886089361cf40549b374ac3541cd0e5aedc
matches the fixed candidate; product schema and merge policy unchanged.

11/11 helper tests exercise raw extensions/schema-less legacy, exact local text,
whole reread comparison, limits, credential-field rejection, cancellation, partial
failure and deterministic builder. 8/8 facade tests exercise actual factory/app
merge, native GET policy, pending revalidation, owner/token revision/controller/
media/cache/writer/lifecycle fences and listener cleanup. Reviewed collector
validates appData family metadata before body dispatch; facade alone is not a
general arbitrary-file-ID authorization API.

## Next unit and boundaries

Backup closes, persistence remains. Fresh complete pre-submit snapshot and
same-account/current-owner checks precede restricted canonical own-writer
merge/save and independent raw readback. Do not enable global flag, alter other
writers or delete legacy. Normal runtime restore, fresh-origin reconstruction,
device convergence, rollback runtime and release acceptance remain separate.
D-057 permits Android testing before handoff; physical/simulated proof stays distinct.
D-056 preserves pause without overlay; overlay-only touch repair stays queued.
