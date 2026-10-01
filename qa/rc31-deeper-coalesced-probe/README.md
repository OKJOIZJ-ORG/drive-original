# rc.31 bounded deeper cohort 2

Additive preparation from frozen `qa/rc29-deeper-coalesced-probe`, bound only to
Git `4a484e6f839d2e6c3eb83503acb08147362cb011`, `1.22.0-rc.31`. Build rejects
different Git app/SW/version bytes and drift in the maintained parser, inventory,
selector, reader, cache, diagnostics, facade or entry logic. No product edits,
actual browser/account/network requests, staging or commit were performed.

The prior rc.29 cohort 1 remains historical: 8 attempted, 3 complete, 5 deferred,
140 metadata GETs, 72 media GETs, stable final catalog and released ownership.
Its private registry was lost; this leaf imports no prior private identities,
track results or body coverage. A fresh complete current catalog reselects the
representatives before **one explicitly requested cohort 2**. It does not retry
cohort 1 or loop through the remaining cohorts.

The historical safe plan had 36 representatives / 11 cohorts; cohort 2 was
representatives 5/6/7: AVI metadata, JPEG, MKV/EBML. The current catalog may change
that plan. Check `summary.plan`, `summary.stratumCoverage` and current results.
EBML structural tracks can distinguish video/audio codec metadata if the file
really has EBML bytes. AVI or MKV metadata with TS magic remains
`TS_DEFERRED_NO_CONTINUATION`, with no fabricated tracks. Rotation representatives
were later cohorts; this cohort cannot claim rotation, HDR, VFR, audio output or
decoder support. Metadata extension/MIME never substitutes for validated magic.

Load these files as expressions in the root's already-qualified **idle** app
document. The root first verifies delivered rc.31 independently. Store evaluated
`factory.expression.js` as `window.__rc31DeeperEntry`, and evaluated
`sw-proof.expression.js` as `window.__rc31DeeperSwProof`. The proof performs exactly
four bounded static GETs and validates current controller/runtime-cache coupling
and immutable Git source hashes; it does not read Drive metadata/media or expose
credentials. Wait for its `.poll().done` and `.poll().accepted === true`.

Set `window.__rc31DeeperPriorityName` privately to the user's exact supplied
priority name, then evaluate `derive-context.expression.js`. It uses at most two
authenticated metadata GETs to establish one exact-name match, one parent, and a
listable parent folder. Its four-key JSON context stays only in
`window.__rc31DeeperContext`; it deletes the supplied name and returns safe flags.
Do not print that context or reuse an old version's proof/context.

The explicit entry and polling commands are:

```js
window.__rc31DeeperJob = window.__rc31DeeperEntry(
  window.__rc31DeeperContext, window.__rc31DeeperSwProof,
  {cohort: 2, mode: 'probe'}
);
window.__rc31DeeperJob.poll();
```

There is no automatic timer or retry around this command. Root polls the retained
job and saves only its safe summary. `complete` means all scheduled files were
attempted and the final complete catalog matched; inspect `filesComplete`,
`filesDeferred`, `allFilesComplete`, each failure and identity/cleanup fields.
Timeout/deferred is never a successful file. Do not run other account readers,
playback, state writers or update owners concurrently.

If cancellation is needed, call `window.__rc31DeeperJob.cancel()`, then poll until
`done === true` and `summary.released === true`. After that, cleanup is:

```js
window.__rc31DeeperEntry.cleanup();
window.__rc31DeeperSwProof.clear();
delete window.__rc31DeeperContext;
delete window.__rc31DeeperPriorityName;
delete window.__rc31DeeperJob;
delete window.__rc31DeeperEntry;
delete window.__rc31DeeperSwProof;
```

An active cleanup call requests cancellation; it is not an awaited-release claim.
Only the reader's settled owned cleanup is proven; generic upstream cleanup stays
unknown. Renewal/account/controller/source/foreground/writer/projection changes
cancel the active owner. Fresh owner qualification is required, with no silent
token rebind or cross-version carry. Never clear browser caches/cookies to reset QA.

Limits remain 64 media GETs, 2MiB+8192 received bytes and 50s per file; 1MiB per
request, 10s headers/no-progress, 8 files maximum, 600s run, 512 metadata GETs /
64MiB aggregate. Two complete inventory calls (four passes) and the observed
first-inventory envelope plus 25%/margins reserved for final inventory remain
binding. Coalescing caches at most 16KiB inside an independently validated moov
body; small bodies split, no full-moov/mdat-payload/whole-file GET. Copies zero on
release and source/account checks run on cache hits. Unknown prefetched metadata
is not parsed into invented tracks. Validated Range body/returned-range checks
remain in the unchanged maintained reader.

CORPUS06 (canonical spec lines1076–1084) requires complete inventory, feasible
whole-video bounded probes, image-header classification, explicit budget omissions
and actual-device rare/failure combinations. This finite deeper representative
leaf is **not** a whole-video header driver or full corpus closure. Repeated full
inventory and serial sparse EBML/top-level metadata reads consume wall time; a
940B prefix also cannot establish every codec/HDR/VFR/track combination. The next
useful discriminator is the current cohort's bounded signature/track result,
not increased budgets or replaying all cohorts. Whole feasible prefix coverage
remains separately root-owned and must retain all unattempted/deferred denominators.

Local preparation: `node qa/rc31-deeper-coalesced-probe/verify.mjs`.
`provenance.json` records exact expression/module/source pins;
`curated-savepoint.json` lists only this leaf's safe files. Original rc.29 producers
and actual records remain unchanged. Local fake-byte tests are not actual proof.
