# Current rc.10 read-only corpus slice

This QA-only factory recomputes the current canonical-root metadata inventory,
selects the maintained deterministic current representatives (at most38), and probes fresh bounded
bytes. Historical rc.4 adapters remain unchanged. No product code, UI, Worker,
Drive objects, installed-app data, production deployment, or automation is changed.

```powershell
node --test qa/v2-07a-current-corpus-probe/probe.test.mjs
node qa/v2-07a-current-corpus-probe/build-browser-bundle.mjs
```

`current-corpus-browser-bundle.js` is a deterministic public JavaScript expression
returning `createCurrentCorpusProbe`. Load its exact local text into CDP to obtain
a private function handle. Invoke that factory with a private runtime object;
retain its returned private handle for `run()`, `runMetadataOnlySelection()`,
`cancel()`, `progress()`, and
`done()`. It writes no page globals. `run()` returns one promise on every call,
and a cancelled handle cannot restart. `cancel()` before running starts only the
release path. Poll only safe progress/done results, then release remote handles.

`runMetadataOnlySelection()` is an explicitly metadata-only discriminator. It
uses the same fresh repeated inventory, maintained risk selector, ownership
fences and one-shot release, then stops before any media read. It returns fixed
`selectionPreflight` count/boolean dimensions: selector success, selected count,
schema and priority match, duplicate freedom, valid resource-key references,
complete identity, complete risk coverage, historical38 match, current count
within1..38, and body eligibility.
No category combination or per-object rows are exported. Its `mode` is
`metadata-only-selection`, `complete` stays false, and a null failure means this
preflight ran, not that its `bodyEligible` flag is true. Subsequent `run()` calls
on the same handle return that same result and cannot start media. Default
`run()` allows valid current selections of1..38 and refuses0 or39+ while requiring
all coverage and interface gates before any body. Historical38 match remains an
observational field. The historical body budgets are unchanged.

The runtime object must supply:

```js
{
  appVersion: APP_VERSION,
  readState: () => state,
  getSWIdentity: () => proof.get(),
  getMutationsEnabled: () => DRIVE_MUTATIONS_ENABLED,
  getQ1Playback: () => q1Playback,
  getQ1RetirementResult: () => q1RetirementResult,
  getMediaSourceGeneration: () => mediaSourceGeneration,
  getPlayerMediaPriorityActive: () => playerMediaPriorityActive,
  hasUsableToken,
  nativeFetch: globalThis.fetch.bind(globalThis),
  navigator, location, top, self,
  addEventListener: globalThis.addEventListener.bind(globalThis),
  removeEventListener: globalThis.removeEventListener.bind(globalThis),
  privateContext: context.get()
}
```

`proof.get()` must return `{controller, version}` tied to the **currently activated
controller's observed runtime version**, returning null on controller change.
The active SW normal shell-fetch/cache behavior can establish this ownership;
the delivered public `sw.js` hash alone does not establish the executing version.
`context.get()` privately supplies `{accountKey, generation, rootId,
priorityFileId, priorityVersion}` from fresh canonical-root/priority/account
provenance. Neither handle nor its values belong in exported reports or files.

Before every dispatch and result, the helper requires exact rc.10 top-level
candidate origin, activated matching SW, global writes false, online authentication,
non-demo usable token, idle media and inactive player priority, null Q1, and a
settled Q1 retirement result. It fences the same state object, account, auth/data
generation, token/revision/expiry, media session/source generation, controller,
retirement result reference and live account-state AbortController. Page lifecycle
or account-state abort ends the lifetime.

Each file receives exact pre/post metadata identity checks. A second full repeated
inventory and cross-run comparison reject catalog drift. This is observational
stability, not a transactional Drive snapshot. Inventory reads use a native
GET-only authenticated facade, with no helper auth/rate replay: at most 512 total
helper metadata/media dispatches in ten minutes. Metadata uses streamed byte
limits of 2 MiB per response and 64 MiB total, fatal UTF-8 parsing and a 25-second
per-request deadline. The per-request signal composes caller, lifetime and account
ownership signals. Byte limits stop after the first offending delivered chunk;
they do not control the browser/network's internal chunk allocation.

Files of size <=940 bytes skip body reading. Others read 0..939 once for actual
byte routing. Only five aligned TS sync bytes authorize a TS continuation; MIME
and extension never choose the route. Only TS files **larger than 65536 bytes**
read 940..65535. The retained prefix and continuation are concatenated for the
maintained TS parser. Smaller TS objects remain prefix-only evidence. No request
consumes a file's final byte or the complete object. The ceiling is two media
dispatches/65536 bytes per file and 76 dispatches/2490368 bytes across at most38 files.

The reused bounded reader requires strict 206, exact exposed Content-Range,
Content-Length, Accept-Ranges, no-store and exact bounded body length. The current
SW's hidden-upstream Content-Range contract is exercised locally: known exact
size plus exposed exact Content-Length reconstruct a validated downstream range;
unproved headers fail closed. Any media header/body/owner/metadata failure stops
all later body dispatches, even if a failure metadata postflight succeeds.

TS aggregates preserve the maintained profile/format/audio evidence gates: only
`MPEG_TS_STRUCTURE_COMPLETE` can promote parsed H.264 High Level3.0,
360x640 BT.709 limited-range, or AAC-LC48kHz stereo details. Incomplete structure
retains signalling and inconclusive detail buckets. Safe role aggregates include
the priority sample without its identity. Raw programs, file IDs, names, account,
tokens, versions, resource keys, manifests, rows, media bytes and error text are
never exported. `complete` means this bounded batch and catalog comparison ended
successfully for every current selected object (processed equals positive selected
count); it does not mean complete-file parsing, decoding or playback. Metadata-only
selection never sets `complete` even when its current selection is body-eligible.

Generic media requests intentionally omit `mediaOwner=q1` and `sourceGeneration`,
use the real idle media session, and send no retirement message. Synthetic large
generations or retire-through cutoffs would poison later genuine Q1 ownership.
The existing generic SW may refresh/retry upstream credentials internally, so
helper dispatch counts are **not** exact total upstream Google request counts.
Token/revision changes terminate the helper; its code does not invoke refresh.
Client reader cancellation cannot prove generic upstream/native Q1 retirement
or total retained memory. The aggregate always preserves those limitations.

Observed local evidence: 23 focused tests pass, including malformed/oversized
streams, reader-acquisition failure and timer/listener release, ownership changes,
held-read timeout with nonsettling cancellation,
first-failure stop, EOF avoidance, prefix reuse, request ceiling, privacy,
one-shot release, actual current app lexical credential behavior, actual current
SW hidden-header validation, and semantic target evidence gates. Integration
additionally exercises the real maintained selector + canonical inventory
integration at1/36/38/39 objects, count0 rejection, and current1/36/38 pre/post
identity/catalog completion with the unchanged upper budgets.
The first actual run failed safely at selection before any media; its root-owned
source, bundle and aggregate are frozen separately. The subsequent root-owned
metadata-only discriminator observed36 representatives with every schema,
priority, duplicate, resource-key, identity and coverage gate true; only the
historical exact38 test failed. It used62 metadata GET dispatches/11387268 bytes
and0 media requests. Its source, bundle and safe report are frozen separately.
That observation justifies treating38 as the upper budget rather than an exact
current count. The23 tests are local fixture evidence; actual bounded media
corpus execution is a separate root-owned
read-only action. ISO-BMFF tracks, all-format/decode acceptance, physical iPhone
seek/home return, mobile overlay repair and production acceptance remain open.

Root-owned actual execution is recorded in live-rc10-results.json and
memory/CORPUS-RC10-20260928.md:36/36 per-file identity/bounded reads pass,
51media requests/1002780bytes,15complete bounded TS structures. The final
cross-inventory comparator rejected and complete remains false. Its wrapper
collapses every comparison exception to CATALOG_DRIFT; original code and actual
difference are unknown. Initial/final internal repeated inventories separately
passed. No body replay is needed to preserve this valid per-file evidence.
