# Fixed31 root-only finite prefix bursts

Additive from frozen rc.28 runner. Only its two fixed source/version literals
change; the private API, capsule ownership, timing, limits and redaction logic are
unchanged. Its legacy read schema stays `drive-original.rc28-serial-corpus-runner/1`;
`version`/`sourceCommit` identify **rc.31 /4a484e6f839d2e6c3eb83503acb08147362cb011**.
Build pins an embedded exact31 factory; callers cannot supply another factory or
capsule. Old saved11 runner checks stay historical, with normalized source-pin-only
equivalence and test/record hashes; focused31 binding/schema/cancel/restart checks
are new. No actual browser/network/account/device execution or product edit.

Root first qualifies actual served31/current activated controller and fully idle
playback/state/update owners. Load the prefix leaf's `sw-proof.expression.js` into
`window.__rc31DeeperSwProof`; wait for `.poll().done && .poll().accepted`. Privately
set `window.__rc31DeeperPriorityName` to the exact supplied priority, then evaluate
the leaf's `derive-context.expression.js`. It validates a fresh unique priority /
single parent / listable parent folder with <=2 metadata GETs and retains the
four-field JSON at `window.__rc31DeeperContext`. These reviewed helper names are
deliberately reused; close and remove any earlier deeper owner first. Never print
context, names, IDs, tokens, capsules or raw bytes.

Evaluate this leaf's `runner.expression.js` once and retain the returned installer
privately as `window.__rc31CorpusInstall`. Install once:

```js
window.__rc31CorpusRunner = window.__rc31CorpusInstall(
  window.__rc31DeeperContext, window.__rc31DeeperSwProof
);
window.__rc31CorpusRunner.read();
```

Before **each explicit start**, root freshly reads its private actual token expiry
and next reserved natural-watch cutoff. Choose integer `stopBeforeAt` strictly
before both, allowing a cleanup margin. Use a new `deadlineMs` in1..4800000 (80min)
and `maxJobs` in1..8. The runner does not know token expiry; root must not use an old
cutoff or blindly request80min against a shorter live credential window. A safe
first burst is one fresh representative job; subsequent explicitly started bursts
continue videos from the same private successful registry:

```js
// Root supplies these freshly qualified numeric values privately.
window.__rc31CorpusRunner.start({
  maxJobs: 1, deadlineMs: freshDeadlineMs, stopBeforeAt: freshStopBeforeAt
});
window.__rc31CorpusRunner.read();
```

After that successful burst, root may explicitly call `start` again with
`maxJobs: 8` and freshly qualified timing. No outer loop, automation, nightly
schedule or automatic restart is supplied. The first job is representatives<=36;
later jobs are current unique-video union cohorts<=64. Each burst has<=8 jobs,
<=80min; each job retains512 metadataGET/64MiB/600s and final full inventory
reservation, <=64 files/8 serial batches, per file64GET/2MiB+8192/50s,1MiB request,
10s headers/no-progress, exact940B prefixes, no retry or media continuation.

Read `active`, `stopped`, `burst.done`, jobs' `complete/catalogStable/released`,
`coverage` and failures. Successful idle completion may retain this exact factory's
own opaque capsule across natural credential renewal; the next job captures a
**new idle owner** and fresh complete catalog, then revalidates immutable carry.
No active request changes tokens. Account/root/source/controller/context-generation
changes still reject; prior credential evidence epoch remains provenance. Natural
renewal **during** a job cancels it and permanently stops that runner. A deadline,
pause, cancel, failure or source drift cannot be restarted. Do not use pause as a
resumable idle wait; wait after a successful finite burst for renewal instead.

Pause/cancel and cleanup are explicit:

```js
window.__rc31CorpusRunner.pause(); // terminal cancellation request
window.__rc31CorpusRunner.read();  // retain failure/cancel evidence
window.__rc31CorpusRunner.cleanup();
window.__rc31CorpusRunner.read();  // wait for active=false && disposed=true
```

Only after drained cleanup, clear proof and retained helper globals:

```js
window.__rc31DeeperSwProof.clear();
delete window.__rc31DeeperContext;
delete window.__rc31DeeperPriorityName;
delete window.__rc31DeeperSwProof;
delete window.__rc31CorpusRunner;
delete window.__rc31CorpusInstall;
```

Cleanup destroys the private registry; a newly installed runner starts fresh and
cannot import it or previous-version evidence. `stopBeforeAt` triggers cancellation,
not a guaranteed drained-by instant. Leave margin and observe release before any
playback/watch/other account reader or state writer. Generic upstream cleanup is
unknown; browser cache/cookie reset is not part of this API.

The current denominator is dynamically re-enumerated; historical2186 is not
hardcoded. Eligible prefix stage completion requires a successful stable/released
video job whose original factory reports `allEligiblePrefixesValidated=true`,
failed0/unattempted0. Unknown940B signatures remain explicit and may keep
`knownSignaturesAllEligible=false`; ineligible and deeper-unprobed counts remain.
`wholeCorpusComplete` and actual playback count stay false/0. This serves the
feasible whole-video prefix part of CORPUS06; image headers, deeper codecs/HDR/VFR/
track topology and physical-device rare/failure playback remain separate. Repeated
complete inventories and serial metadata/identity latency remain the wall-time
bottleneck; several finite root-started bursts may be necessary, without higher caps.

Rebuild `node qa/rc31-corpus-serial-runner/build.cjs`; focused fake-only verification
`node qa/rc31-corpus-serial-runner/verify.cjs`. `inherited-verify.cjs` is byte-exact
historical test source, intentionally not executed here. Exact curation/hashes are
in `curated-savepoint.json`, `provenance.json`, `local-verification.json`. Root owns
actual qualification, fresh timing, starts, safe evidence persistence and commit.
