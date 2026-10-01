# One exact Q3 disposable fixture — local preparation

D-050 already authorizes creation, readback and recoverable cleanup of task-created
test data. Root specifically admitted one uniquely tagged folder and one immutable
video (2 generated IDs, 2 POSTs). No permission is needed again for that scope when
the existing `driveWrite` capability is admitted. Its live availability is unknown
here: this unit reads no account, provider or credential. A missing capability
returns `grant` before requests; provider HTTP rejection preserves only safe status
and stops. A 403 alone does not distinguish missing scope from item permissions.
There is no OAuth, new grant, original mutation, sharing or permanent-delete path.

The established creator is `qa/rc31-disposable-ui-preparation/job.mjs`, `create()`:
generated IDs, persisted sent intent, immutable multipart media POST and independent
GET receipt. The product `disposableDriveMutations.activate()` in `app.js:9788`
admits exactly two media IDs and PATCH move/trash only. It is unsuitable for a single
Q3 upload and stays unchanged. This derivative reuses the separate restricted QA
creator/recovery ownership. It does not claim product upload UI/controller proof.

`disposable-binding.json` is explicitly bound to immutable Git
`5174485b3c17d047259701bbdd889f9b0740f555` / `1.22.0-rc.33`, app/SW/version bytes.
The builder requires that full SHA, reads only those immutable objects and the
SW's 46 unique cached files / 47 aliases. No HEAD/working-tree source fallback.
The Q3 observer's current `source-proof.expression.js` supplies broader live shell
proof; public downloadable source archives are outside the runtime shell.

Exact input: `qa/q3-product-integration/synthetic-640-180s.mp4`, 18,075,476 bytes,
SHA256 `cda53855c53bf1d608491eb96aa3abb0ff774cca2aa24cfe01447e295c07ed7a`,
MD5 `6df04298bf9b43cd60e3af70cd1e309f`. The factory embeds the public fixture
fingerprint, not media bytes. `create(blob)` hashes the supplied exact-size Blob
before the first provider request. Independent metadata GET requires server size,
SHA256 and MD5 plus stable tags/role/name/parent, owned MyDrive, untrashed state and
version; a missing server SHA256 never admits the observer holder.

Evaluate `disposable-factory.expression.js` and `disposable-facade.function.js` in
the root-owned app lexical context after current rc.33 proof, loaded settled idle
account and existing grant. Use `facade(factory,binding,__resumeSwProof,{})`, then
`await creator.create(privateExactFixtureBlob)`. The Blob is a File subtype loaded by the existing owned native MCP `upload_file`
into the one QA input from `disposable-file-input.function.js`. Extend only the
derived rc.33 owned operator allowlist, use this exact local fixture path and a
fresh current-tab snapshot input UID; do not use another profile/server. Evaluate
`inputFactory(binding,__resumeSwProof)`, use native `upload_file({uid,filePaths:[exactPath]})`,
then `await input.capture()` to privately stage `__q3FixtureBlob33`; selecting a
file never starts upload. Root manually calls `creator.create(__q3FixtureBlob33)`,
which hashes it again before provider access. `input.clear()` after the creator
settles releases this one input and private Blob. No base64/model media transport,
new login/profile or Chrome process termination is needed. If the current owned
MCP cannot expose native upload_file safely, report the actual tool boundary;
no media-transport bypass is installed. No loader downloads original media. Results are
safe counts/booleans/allowlisted failure/status only. Read all safe results before
continuing. Account/auth/token revision+expiry/writer/state revision/projection,
controller/script URL, source hashes, document URL, lifecycle and player fences
remain fixed during each short owner.

Before first POST, all 2 IDs, exact tags/parents/roles/body intent and root metadata
are durable. Each sent intent is saved again before dispatch. A separate durable
fixture/run pointer refuses a second creator once that run has reached submission
preparation. Never clear it or generate a new run to recover. No POST or PATCH retry
exists. An unknown result stays unknown until fresh exact-ID GET confirms it.
Keep the private run handle in the root's protected browser/backup path: consume
`creator.privateText()` privately before `await creator.clear()`. It contains the
complete ledger, snapshot and durable pointer, no token. Never return it to a model,
safe artifact or Git. Preserve prior ledgers rather than replacing them.

Create a fresh fenced job with `{recoveryRun:privateRun}` and `await job.capture()`.
It performs GET only, two complete stable passes of all sent IDs, exact full metadata
receipts and one-page bounded children of this one known QA folder. A 404 is failure,
not absence-as-success. An unknown child, continuation, incomplete search, altered
tag/content/parent or changing receipt stops. Folder versions may advance from own
child operations; capture demands fresh stable versions rather than creation-version
equality. The root is read only; no root child discovery is performed.

Only after successful fresh capture, `job.installTarget()` privately sets
`__q3ActualTarget33={metadata,account:{accountId,authAccountKey}}` and returns booleans.
An existing holder is never overwritten. `await job.clear()` releases uploader
owners/timers/listeners/private copies while the detached holder remains for the
observer. Root must call `job.clearTarget()` after observer cleanup; it deletes only
its own holder. This does not inject UI state, open media or choose compatibility.

After player/observer and holder cleanup, a fresh recovery job's `await cleanup()`
freshly captures first, then recoverably trashes only the recorded video and folder.
Video exact version/receipt is rechecked before PATCH. The folder admits monotonic
version advance from its own child trash, requires a fresh complete empty-child
page and stable current metadata before its PATCH. Both PATCH intents are saved
before dispatch and independently read back. Unknown PATCH outcome is recovered
by GET in a fresh job; already observed trash is skipped, never resubmitted. No
restore/move/addParents/delete or arbitrary endpoint API is exposed.

Existing limits retained: 120s owner lifetime, 15s total request, 40 requests,
4 writes maximum, 64KiB each JSON response and 1MiB aggregate response; cancellation
is awaited with a separate 2s cleanup deadline, including late fetch responses.
The 18MB single multipart POST may exceed 15s on an actual connection. Preserve
sent IDs and stop; do not repeat it, increase limits or infer upload success. A
per-file observed server checksum is stronger evidence than the POST response.
Awaiting client cancellation does not prove provider-side work stopped:
`genericUpstreamCleanup` remains `unknown`. Fresh GET/PATCH is not an atomic remote
lock; mutable private ledger/pointer are operational evidence, not cryptographic
security against privileged DevTools.

Rebuild: `node qa/q3-actual-preparation/disposable-build.cjs 5174485b3c17d047259701bbdd889f9b0740f555`.
Verify: `node --test qa/q3-actual-preparation/disposable-test.mjs`.
Local cases use the actual immutable 18MB Blob through the generated factory and
facade, positive creation/capture/recoverable cleanup, unknown response recovery,
duplicate denial, hash/owner/grant/storage/unknown-child denials, awaited late
cancellation, cleanup response loss and private holder lifecycle. No actual browser,
Drive/device/provider request, product edit, staging, commit or push by this child.

The new connection is `disposable-pc-owned-operator.cjs`, a minimal derivative of
`qa/rc32-prefix-recovery-preparation/pc-live-observer-recovery.cjs`. Root first
closes the existing owned connection (no Chrome reload/kill/settings), then starts
`node qa/q3-actual-preparation/disposable-pc-owned-operator.cjs disposable-pc-owned-<unique>-safe.json session`.
It reuses installed MCP/SDK with `--autoConnect` to the existing normal profile,
requires exactly one candidate tab and rc.33 loaded/online/visible/closed admission,
and requires native upload_file availability before READY. It adds only upload_file
to the established click/key/select/snapshot/fill/hover/screenshot/network set.
Raw snapshots/network/tool errors stay private in this QA leaf. Upload uses
`{op:'tool',name:'upload_file',args:{uid:<fresh private snapshot UID>,filePaths:[<exact fixture path>]}}`.
A snapshot is valid at most30s, must identify exactly one file-input role with the
QA label, and the operator revalidates that actual UID as the exact known DOM input
in a fresh source/controller/account/idle check immediately before native transfer.
It verifies local bytes/SHA again; any other path/UID/source fails before upload_file.
The SDK receives the File directly; JSON `load` and `eval` remain200KB bounded.
Send `{op:'close'}` after cleanup. Exactly one compact final ACK appears only after
owned client closure: `{"op":"close","closed":true,"ownedMcpClosed":true}`.
No operator launch or Chrome/provider call was performed in this preparation.

Installed official MCP1.10.1 `build/src/tools/input.js:556` defines `filePaths: string[]`
with min1; this operator requires exactly one and explicitly rejects singular
`filePath`, mixed forms, empty arrays and multiple paths. Focused local validation
reads that installed schema source statically without imports/launch/handler calls.

Root subsequently added the fixed `private-save` command to the owned operator.
Use `{op:'private-save',kind:'ledger',name:'q3-ledger-<unique>-private.json'}` or
the corresponding `kind:'target',name:'q3-target-<unique>-private.json'`.
Ledger reads only the fixed fixture/run pointer and its selected recovery ledger;
target reads only `window.__q3ActualTarget33`. The destination is fixed to
`qa/v2-state-recovery-backup`, whose existing protection is an operating assumption.
Names accept lowercase ASCII letters/digits/hyphens within the exact kind-prefixed
pattern, with no path separators/traversal/drive/stream syntax. Existing files are
refused and the actual write uses exclusive `wx`, including a competing-create race.
Serialized backups are limited to1MiB. Success returns only `savedPrivately`, byte
count and SHA256; private IDs, names, account data and ledger contents never print.
This preserves private evidence; it does not validate the mutable pointer/holder,
prove fresh source/account identity, or attest current provider metadata. Root must
save from its already qualified owner context. The backup's ACL/reparse-point state
was not inspected, and generic `eval` remains trusted-root-only.

Verify this additional branch locally:
`node --test qa/q3-actual-preparation/disposable-private-save.test.cjs`.
Four additional cases passed against the exact branch and actual error sanitizer,
using synthetic browser state and in-memory filesystem only. They are separate
from the previous9 creator/facade/upload-routing cases; those unaffected cases were
not rerun. The operator itself was unchanged by this review. Its root-adapted SHA256
is `7befb913189446e55d0cb089f5a12ba305312e06fe49cf2290209769e88bfee5`;
the previous upload-schema-corrected operator was
`2a99dd68869d9f61f0922ee47f7a252389158dab18596135e6eed636ec3edc7b`.
The new test's hash is recorded in `disposable-local-review.json` and
`disposable-savepoint.json`. Every protected backup remains excluded from Git and
model output. Root separately observed its first owned session time out in
`list_pages` after180s (`McpError -32001`) and confirmed closure. No fixture upload
occurred and no second connection was attempted in this review. Child browser,
provider and device actions remain zero; this local proof does not resolve that
actual browser boundary.

Later, root separately reported successful existing-tab CUA CDP qualification of
rc.33 loaded/online/usable/visible/closed with general writes false. That report
does not erase the retained official autoConnect timeout or prove native upload.
Root owns any separate pinned local bridge and subsequent actual operations; this
private-save review made no CUA, browser or bridge calls and does not cover them.
