# Bounded disposable live Drive QA

This helper tests a lexical QA instance of the **actual public `app.js` mutation
controller**, not the normal product UI. It leaves the page's immutable
`DRIVE_MUTATIONS_ENABLED=false`, account-state owners and production runtime
unchanged. This is D-050's disposable-data validation, separate from appData
migration, old-origin state inclusion, natural token expiry, sustained Q1 and
physical iPhone acceptance.

## Build and focused checks

From the canonical `source` directory:

```powershell
node qa/v2-disposable-live/build.cjs
node --test qa/v2-disposable-live/guard.test.cjs
```

`build.cjs` reads the current canonical source and copies the complete mutation
controller between `DRIVE_MUTATION_PREFIX` and
`summarizeDriveMutationFailures`, plus the real resource-key and drive-ID
normalizers. Every controller function remains byte-identical. Only its storage
prefix changes. The QA closure supplies its own constant true and transport,
storage facade, frozen account request owner and shadow state. Its owner captures
existing page generations/signals without invoking the page's capture helper,
which could otherwise create a new product-owned abort controller.

The builder uses the already installed `worker/node_modules/esbuild` and writes
`browser-expression.js`; the expression contains public code only. Its API reports
the canonical extraction SHA-256. The focused test compares canonical controller
bytes and tests independent reads, loss/drift guards and private output.
Probe instrumentation exists only in the Node test VM, never the browser output.

## Run in the authenticated candidate Chrome tab

Use Chrome DevTools MCP against the already authenticated **candidate** tab and
same verified account. Verify public `app.js` matches the source used by this
builder and the page global mutation flag is false. Inspect applicable candidate
state gates independently; this helper does not satisfy them.

Read the local `browser-expression.js` as a UTF-8 string and evaluate its contents
in the candidate page's lexical app context. Keep the returned API/job in CDP
remote object handles; no page global property is necessary. The conceptual calls
are:

```javascript
const api = eval(publicBrowserExpression); // retain as a CDP object handle
const job = api.start();                  // retain as a CDP object handle
return job.poll();
```

Only return `poll()` to the coordinator. Poll at ordinary short intervals (a
single call is immediate); `done` is available inside the browser but should not
block a tool call for the entire run. The handle emits only phase, counters and a
safe completion result. It never emits tokens, Drive IDs, names or raw metadata.
`cancel()` aborts owned requests and retains the private recovery ledger.

The default sequence resolves My Drive root, generates three IDs, durably records
them, creates two uniquely tagged private root folders and one metadata-only
`text/plain` test file, moves it A→B, trashes it, restores it, moves it B→A,
then trashes **only the disposable test file** for recoverable cleanup. The two
uniquely marked empty test folders remain in My Drive; folder PATCHs are forbidden
because a folder could acquire unrelated descendants after creation.
One first move response is deliberately discarded after the real PATCH response
arrives, so the canonical independent GET must confirm the real effect without
replay. `start({loseFirstMoveResponse:false})` disables this optional fault.
An ordinary successful default run uses 3 POSTs and 5 PATCHes; cleanup stays in
Trash, never permanent deletion. `cleanup:false` retains restored disposable
objects in folder A, so prefer the default unless retaining a sample is intended.

The real product mutation flag must remain false, credentials must stay online
and usable, and media must remain idle with Q1 retirement settled. These checks
and auth/account/data/token revision/SW ownership, lifecycle cancellation,
180-second run bound, 20-second individual request bound, 90 requests and 1.5MB
response budget are enforced. Each response is read as a bounded byte stream
(131072-byte per response maximum) and canonical operation abort signals are
composed with QA lifetime cancellation. Access token refresh during this short run deliberately
cancels it rather than crossing an ownership change. No auth refresh, automatic
POST/PATCH retry, appData, broad list, upload, sharing, permissions or DELETE is
implemented. A tag/role/ownedByMe/parent/version/metadata check failure stops writes.

## Interrupted or uncertain runs

Leave every `drive-original.qa.disposable.<uuid>.*` storage entry in place.
The private `.recovery` entry retains planned IDs **before creation**, submitted
events and remote observations. A response-loss path always reads the known ID;
404 or unreadable metadata is uncertainty, never deletion proof or permission to
retry. Controller rows use the same run namespace and never touch normal ledger
values.

To re-check after interruption, retain `job.recoveryRun` via the remote object
handle (a QA run UUID, never a Drive ID). If the handle is lost, select that UUID
inside the browser from the QA namespace. Recovery verifies its stored account
matches the current authenticated account:

```javascript
const recoveryJob = api.start({recoveryRun:job.recoveryRun});
return recoveryJob.poll();
```

Recovery performs exactly the root GET plus individual GETs of recorded submitted
IDs, validates the original tags/roles/ownership again, and returns aggregate
verified/unknown counts. It makes no Drive writes, does not replay an operation
and retains the ledger. If a run stopped before all IDs were planned or an
object cannot be authoritatively verified, preserve the ledger and investigate
within the disposable scope. Do not start another run as a recovery replay or
automatically clean up uncertain objects. The default completed run already
provides verified recoverable cleanup; interrupted-run cleanup needs a separately
reviewed action using the private ledger and fresh authoritative reads.

## Official API basis

- [Generate IDs](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds)
  (`GET`, exactly `count=3&space=drive&type=files`).
- [Create files and folders with pre-generated IDs](https://developers.google.com/workspace/drive/api/guides/create-file).
- [Metadata-only create](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/create).
- [Update and parent move parameters](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update).
- [Trash and restore](https://developers.google.com/workspace/drive/api/guides/delete).

The coordinator checked these primary references before live execution; the
child builder itself makes no browser or network calls. Synthetic passing tests
are local QA evidence until the actual candidate job completes successfully.

## Independent final-version readback

After a completed default run and optional read-only recovery, use the separate
`verify-final.js` as the exact `Runtime.callFunctionOn.functionDeclaration`, with
`this` bound to the coordinator's private control handle containing `job`. Set
`awaitPromise:true` and retain normal CDP object ownership; no page global variable
or installation is required. The verifier reads only
`this.job.recoveryRun` and that exact QA recovery storage key.

It validates the final ledger/account and all three role/tag/owned-by-me identities
before any request, then makes exactly six metadata-only native GET requests
on success: three fresh final snapshots, followed by the same three independent
reads. Fresh ID, parent, trash state, MIME, tags and My Drive ownership must match
the recorded metadata in both passes. The test file's version must also equal
its recorded final version. Folder records were captured at creation, before the
test file lifecycle; their fresh versions must be well-formed nondecreasing int64
decimal strings. Whether each folder still equals its creation version is reported
separately. Every target's version and semantic state must remain exactly stable
between the two fresh passes; folder advancement during those passes fails.
Owner, immutable false product
flag, online/usable credentials, idle media and settled Q1 retirement are checked
throughout bounded byte-stream reads. It uses no storage writes, Drive writes,
listing, retries or authentication refresh. Each request has a six-second bound;
the entire verifier has a twenty-second bound.

Only aggregate request/byte/owner data and safe per-role status/state/tag/ownership
booleans, both HTTP statuses and snapshot-stability booleans are returned. No raw
versions are returned. Responses are capped at 32768 bytes each and 196608 bytes
total. A mismatch, owner loss, unknown ledger or unreadable response
fails closed and leaves all private recovery records unchanged. This readback
supplies fresh final-version evidence independently of browser network event
retention; it does not imply retained request-trace equality or normal product UI
acceptance.

```powershell
node --test qa/v2-disposable-live/verify-final.test.cjs
```

`verify-final-pre-folder-correction.js` preserves the failed earlier verifier
unchanged. It treated folder creation versions as final versions; the observed
failure differed only in folder version, which did not justify that equality
assumption. Google documents that [file versions increase for every server
change, including invisible changes](https://developers.google.com/workspace/drive/api/reference/rest/v3/files).
Attributing this particular increase to child-file operations remains an inference.
The corrected verifier establishes final-state stability without weakening the
file's recorded-final-version check.

These tests are separate from the already frozen and live-executed mutation
builder/expression/controller guard unit.
