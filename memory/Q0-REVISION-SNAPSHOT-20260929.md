# Q0 revision snapshot and retirement evidence

Observed2026-09-29 KST, source7f3ef0f, unchanged hosted rc.13/570f9c3. Product integration is the next unit; these prototypes are QA only.

Existing-source files.download revisionId: one empty POST, initial done, exactwww.googleapis.com revision URI, two2-byte206 reads, identity unchanged and all local references released. Current-head conditional JSON etag had previously returned206 for both matching and nonmatching validators, so it remains rejected.

The first newly-created disposable probe failed OPERATION_NAME before B mutation. It restored/verified A and recoverably trashed its own target. The corrected copy treats the name as a bounded opaque parameter. Actual A→B challenge then proves latest reads B and first revision URI still reads A; restoration/readback/trash verification all pass. Seventeen requests/four file writes/64 media bytes/14.6s. No original media, KeepForever, sharing, permanent deletion or account-state mutation. Exact executed bytes and safe records are in qa/q0-revision-pin-disposable-rc13b; the failed baseline remains separate.

The QA stream owner originally reported settled while public consumers were pending. A repaired copy separates internal source termination from external close joining bounded consumer drainage. Fifteen canonical and generated-classic tests pass, including the reproduced failures and sticky unconfirmed cleanup. Native browser/performance acceptance remains separate.

Adopted implementation direction: acquire one immutable provider snapshot with metadata before/after files.download; require page acknowledgement before media bytes; retain the private pin across SW restart and credential renewal; avoid fresh metadata per1MiB chunk, which could add46 RPCs to the observed23MiB index. Public media URLs carry no revision, checksum, token or provider URI. Any expired/unavailable pin fails visibly rather than silently adopting latest bytes. The original69 gate matrix is not relabeled complete by these bounded experiments.
