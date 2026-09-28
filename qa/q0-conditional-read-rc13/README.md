# rc.13 conditional-read discriminator

QA-only expression, reused from the reviewed clock facade's exact in-page owner,
idle-player, metadata identity and cleanup machinery. `build.cjs` records producer,
base, tail and final hashes in provenance.json. No product source is changed.

Root imports the exact `facade.expression.js` into the already-authorized page's
lexical evaluation, then invokes `create(exactStateFilesObject, freshSwProofHandle)`.
Return is an immediate frozen job exposing `poll()` and `cancel()`. Poll output is
aggregate only. Keep both input handles private; no IDs/names/ETags/tokens/URLs or
raw body buffers are returned. Expected app/SW is rc.13 and only the fixed public
candidate origin is admitted. Existing capability object, token text/revision and
expiry, account/session/source/controller, loaded state writer/projection and idle
retirement are all pinned; owner drift terminates the sequence.

Direct Google CORS is intentional: current SW does not expose ETag or forward
If-Match, so using the normal proxy would test its header omissions instead of
Google's conditional content behavior. There is no fetch override or CORS bypass.
All requests are GET. Max3 media GETs each requesting exactly bytes0-1; the exact
206 body is capped at2 bytes (aggregate6). A nonmatching412 body is cancelled,
not read/exported. Unexpected oversized incoming chunks are terminal, not accepted
as within the cap. At most6 metadata GETs, aggregate32KiB, pre/post each media call.
Metadata deadline10s, media15s, run60s, local cleanup2s (+final metadata work3s).
There are no retries. Google/browser internal transfer or cleanup is not claimed:
`genericUpstreamCleanup` remains unknown. `sourceCleanup.settled` describes awaited
local response/reader/fetch settlement only; a rejection or timeout stays terminal.

Hidden/weak ETag: stop after baseline and postmetadata, complete=true means the
discriminator finished, conditionalSupported=null. Strong ETag: matching request
must206, nonmatching412 proves rejection; nonmatching206 records false. Fetch
TypeError is MEDIA_CORS_OR_NETWORK, not a claimed specific CORS root cause.
No additional requests follow cleanup uncertainty. Always wait for done after
cancellation before releasing the private remote handles.

Six local VM tests cover strong/hidden/weak validators, ignored If-Match, CORS or
network rejection, identity drift/missing capability, cancellation and failed
cleanup. These do not establish actual Google behavior or content immutability.
