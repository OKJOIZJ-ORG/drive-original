# rc.11 first actual ISO top-level structure

QA only. The builder reuses the maintained strict streaming metadata driver,
canonical repeated inventory/selector, bounded Range reader and unchanged ISO
top-level walker. Its metadata driver's browser-only lexical VERSION binding is
explicitly rc.11; no old rc.10 source/bundle/result is overwritten.

Build: `node qa/v2-07a-isobmff-rc11/build.mjs`
Test: `node --test qa/v2-07a-isobmff-rc11/probe.test.mjs`

Load the exact `browser.generated.js` expression inside the actual authenticated
app lexical context. Call its returned function with private JSON text containing
exactly `{accountKey,generation,rootId,priorityFileId}` and the root-owned SW proof
handle whose `get()` returns `{controller,version}`. The proof must be tied to the
current activated controller's actual runtime behavior, not delivered script or
merely existing cache bytes. Without a matching rc.11 proof, no metadata/media
request starts. The job immediately exposes only `poll()` and `cancel()`.

Root's proof may require one separate public shell-asset GET; that request is
outside this helper's ledger. Root owns real browser execution and saves only
safe summary/provenance. No QA-global, token, ID, filename, URL, byte, raw error,
per-object manifest, offset, version or private digest is exported.

The complete fresh metadata risk selection must have 1..38 representatives and
all maintained coverage/mandatory gates. Largest MP4/MOV mandatory rows receive
only a private search-order preference. Bytes alone identify ISO. Routing reads
one exact 0..939 head per visited object larger than940 bytes, stopping after
the first actual ISO. Non-ISO receives no continuation; TS is not parsed again.
Within that ISO, the retained head serves header subranges locally. Header reads
beyond it are exact 8/16-byte ranges, including a safe nonoverlapping split at940
when a header straddles the head boundary. At most38 logical header reads and
4096 header bytes; no payload scans. Any range requiring the final byte is
skipped, yielding incomplete evidence, and objects <=940 bytes receive no body.

Whole-run ceilings:76 media requests,39816 accepted media bytes,512 combined
metadata/media dispatches,10minutes; metadata2MiB/response,64MiB/whole run and25s
per request. Strict206 headers and exact streamed body lengths, per-file pre/post
identity, account/auth/token/controller/Q1 ownership, writer/revision/projection
and write-sync quiescence are fenced. Equal normal read refresh is allowed;
credential, owner, projection or queued-write change stops. No fake Q1 owner,
retire message, upstream auth replay, write, OPFS/cache persistence or product
timer modification is introduced. Cancellation/release is one-shot; body or
owner failure prevents every later body dispatch.

The first repeated inventory precedes bodies; the second repeated inventory and
canonical comparison follow. This is observed stability, not an atomic snapshot.
`complete` additionally requires one ISO and a completed declared header chain.
No ISO found or header budget/EOF guard stops keeps complete false even if catalog
stable and transport succeeded. `moov` is only located, never parsed; no valid
brands, tracks, sample tables, codecs, decode, playback, audio or device acceptance
is claimed. Generic upstream/native Q1 cleanup and total browser memory remain
unknown. The actual environment's AUDIO_RENDERER_ERROR is outside this structural
probe and cannot become an audible/device pass.
