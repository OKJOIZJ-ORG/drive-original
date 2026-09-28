# Bounded files.download revision discriminator

QA-only source at7f3ef0f0bd7bac4ec8c9d725f89d6cf0f69be704; target remains deployed rc13/570f9c38506d1e426c33cf65b73836d32bf872c0. No actual provider/browser execution by this producer, product edits, original mutation, new grant, retention or KeepForever changes.

## Runtime API

Evaluate `facade.expression.js` in the current candidate main-world lexical context and invoke the returned function `(exactCurrentStateFilesObject, freshSwProofHandle)`. The SW proof is the existing runtime-cache-write helper with `get().controller` and `get().version`, not an invented SW protocol. Immediate result provides `poll()` and `cancel()`. Export only `poll().summary` after done; release root-owned remote handles. All file/operation/revision/resource-key/token/URI values stay private in closure and are dropped on completion. No body bytes or provider messages are returned. No global app state changes.

Uses the exact pinned v2-discriminator owner guards: current account subject and opaque account key, generation, token string/revision/expiry, capability object, controller and fresh version proof, media/source generation, idle/settled prior player, selected list object, state writer/revision/projection and no pending writes. Fresh metadata pins headRevision/version/checksum and list identity. Current first metadata is the only source of revisionId; non-blob Google Workspace types are rejected.

One empty-body POST to `files/{id}/download?revisionId={currentHead}`. Initial done=true is consumed immediately. Otherwise up to3 operations GETs separated by10s, constrained by the40s run deadline. Per-request deadline10s. Initial/poll Operation object must have consistent private name; no provider messages/details copied. Done errors retain only canonical numeric0–16 status. Operation metadata resourceKey must match any already-known key; the resource-key header is sent for POST, polling and URI fetch as documented.

At most four metadata GETs, one POST, three operation GETs and two media GETs. All metadata+Operation payloads combined are capped at32KiB accepted bytes; a violating oversized browser chunk can arrive before cancellation. Media reads are strictly bytes0–1 and2–3, total4 accepted bytes; no full body, end-of-file scan or fallback. Exact206 Content-Range/length is checked; CORS-hidden Content-Range requires exposed exact Content-Length2 and known source size (reported as hidden/inferred). Postflight metadata follows each media read. Cleanup rejects/timeouts are terminal; overall deadline is40s plus bounded local cleanup settlement. Upstream operation/server cleanup remains unknown and no server operation-cancel API is invoked.

## URI policy and meaning

The docs do not specify a universal downloadUri hostname. This initial producer allows only exact HTTPS origin `https://www.googleapis.com`, with no userinfo or fragment. All redirects are rejected, including a response reporting a different final URL. Returned URI revision/file query identifiers, if present, must match the request. Other origins stop with `URI_ORIGIN_UNQUALIFIED` and no request/token transmission; do not widen to guessed Google/CDN suffixes. A future exact-origin adjustment needs actual returned-origin provenance plus primary ownership/auth/CORS review. A legitimate Google-hosted download can therefore be blocked by this deliberately narrow first discriminator.

Success means revisionId was requested, Operation allowed partial download, two bounded ranges succeeded, and live metadata/owner stayed consistent. It is **not an independent proof that opaque URI bytes are the requested revision**, immutable historical content under mutation, whole-file hash identity, browser decoding, or a universal CORS contract. No source mutation is performed to test immutability. TypeError is CORS-or-network, not asserted to identify CORS uniquely. `sourceCleanup.settled` refers to local callbacks/body ownership only; genericUpstreamCleanup remains unknown.

## Primary contract (read2026-09-29)

- [files.download](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/download): POST with empty body, optional blob revisionId, existing drive/drive.file/drive.readonly scopes, Operation response. This endpoint does not state a KeepForever prerequisite; the separate revisions.get restriction is not generalized to this endpoint.
- [LRO guide](https://developers.google.com/workspace/drive/api/guides/long-running-operations): initial done handling, resource keys on all three request classes, DownloadFileResponse and partialDownloadAllowed for blob content, polling guidance. Initial completed operations should not be polled again.
- [Operation schema](https://developers.google.com/workspace/drive/api/reference/rest/v3/operations) and [operations.get](https://developers.google.com/workspace/drive/api/reference/rest/v3/operations/get): name, pending/done, exclusive error/response and GET path.

## Verification

Blocked returned URI origins can report only an exact generic hostname from the fixed four-name classifier (`www.googleapis.com`, `content.googleapis.com`, `drive.google.com`, `drive.usercontent.google.com`) when it contains no captured private identifier; otherwise only a fixed Google-family classification is returned. Classification does not grant fetch permission. No arbitrary subdomain, path, query, operation name or full URI is exported.

Focused synthetic verification completed:7 passed,0 failed. After the final origin-classification adjustment, the affected2 cases passed.

Root executed the exact f500d16cee5e60031375a57fed91e52ea39e94d4864cde819ac2e30b794ac4b2 expression against an already-listed short WebM on actual candidate rc13. The initial POST returned200/done with650 payload bytes and partial download allowed; no polling was needed. The URI origin was exact `www.googleapis.com`. Both2-byte requests returned206 with hidden Content-Range and consistent exposed Content-Length2. Four metadata GETs consumed1568 bytes. The run completed in4120ms with stable identity/account, local callbacks settled and private references released. Root cancelled the completed job, cleared the fresh SW proof and released its object group. `live-results.json` and `live-sw-proof-results.json` contain only safe aggregates. The proof used one static request and no media/metadata request.

This closes provider availability/CORS of the two bounded reads for this one unchanged source. Changed-revision body identity is still unproven here; a separate newly-created disposable-file discriminator is next. No original content, retention, grants, appData or player state was changed.

Build: `node qa/q0-revision-download-rc13/build.cjs`; exact baseline SHA is checked and output/producer/body hashes are saved in `provenance.json`. Test: `node --test qa/q0-revision-download-rc13/facade.test.mjs`. Synthetic cases cover initial done without polling, finite polling/pending cap, explicit different revision, unsupported API, partial denial, oversized operation/media, origin/redirect rejection, account/source drift, cancellation, cleanup rejection and privacy of arbitrary provider errors. Test polling clocks alone are accelerated; production expression keeps10s intervals and40s total. Actual provider result remains pending root execution.
