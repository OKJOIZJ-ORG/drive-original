# Narrow actual image observation preparation

Prepared locally; no actual account/browser/device/private input was read or run.
Root owns execution after its current corpus/release work. No Android runner,
selector harness, product edits, network requests, settings changes, or commits.

Immutable acceptance: implementation-pack v3.0 lines1718–1719:
QA-FM-07 GIF/animated WebP: static list; actual viewer animation, alpha and timing
preserved. QA-FM-08 large PNG/JPEG/BMP and wrong MIME: original display or safe
conversion; no omitted files; no image-to-video-iframe fallback. MEDIA-07 lines1005+
requires original bytes when displayable, original retained for explicit derivative
conversion, and frame delay/loop/alpha preserved. Four earlier representatives
miss PNG. Root now caps five exact representatives: GIF, animated WebP, PNG,
large JPEG, rare BMP. Ordinary PNG does not prove large-PNG coverage. Wrong-MIME
controlled synthetic rc20 evidence stays separate unless an actual representative
is discovered. These five do not automatically close all FM08 cases.

## Root integration

1. Reuse root's accepted source31/network/cache proof and __resumeSwProof closure.
   Observer checks source4a, three hashes, activated same controller and account;
   it never fetches, writes storage, or installs source proof. HEAD14368ca is local.
2. Root injects only its exact protected `{account:{accountId,authAccountKey},target}`
   binding into the function call. It stays in this private closure; no IDs/names,
   URLs, headers, pixels or credentials enter receipts. Fresh metadata equality is
   a comparison, not independent original payload checksum evidence.
3. Evaluate `installRc31ImageObservation(privateInput)` once; use
   `window.__rc31ImageObservation.fence('card')` with the sampler before opening.
   Open only ordinary UI. No openMediaSource/state/query injection. Android reuse:
   frozen native folder/card geometry, restricted inputCommand only; unsupported
   search names retain a boundary, never synthetic fallback. PC ordinary MCP UI.
4. After normal image decode/route stabilization call `.arm()`; this privately pins
   selected metadata, media/playback session, source generation, account generation
   and q0 pin reference. Root should compare snapshot before/after sampling. Image
   mode admits original-range/sequential/opfs; currentVerifiedOriginalImage is only
   a wrong-MIME dispatch marker and is not universally required. A route generation
   change stops observation; do not rearm silently across a sampled lifetime.
5. Host `samplePainted({phase:'viewer',readFence,capture})`; capture adapter calls
   supported Page.captureScreenshot with format/clip/captureBeyondViewport only,
   respects timeout/maxEncodedBytes/signal locally, and returns a PNG Buffer.
   Do not forward timeout/signal/private binding to CDP. Only 1x1 crop; pass the same
   private host `budget:{sampleCount:0,encodedBytes:0}` object across card/viewer/reopen
   calls for one representative: <=12 captures and <=8MiB aggregate. Each temporal
   observation <=8seconds; root selects finite shorter card/reopen windows within
   its overall reviewed unit. Clip scale is inverse DPR;
   parser requires actual1x1 output and fails closed otherwise. Adapter must not
   save images, log CDP response/base64 or request a whole-screen capture. The host
   exports hashes/timestamps/counts/fixed booleans only; raster buffers stay local.
   CDP has no claimed cancellation guarantee: abort signal retires local consumer;
   root owns disposal of any still outstanding request/session. Sampler removes its
   timeout handles; it installs no browser listeners or persistent capture callbacks.
6. Normal close, wait for snapshot closed/selectionCleared/sourcesCleared/retired,
   same original account/controller/source, then same exact file normal reopen,
   arm and observe again. Finally normal close owned player, `.dispose()` (no owned
   timers/listeners), remove root private call handles and detach only owned session.
   Leave original tab/profile/account/privacy unchanged. Stop at login/new grant.

## Evidence limits and needed observations

Card canvas/absence of live IMG + stable painted samples supports static-list
behavior only for the sampled point/window. Viewer changing painted-pixel hashes
are actual visible frame-change evidence, provided owner/foreground/geometry fences
hold; a stationary center pixel is inconclusive for a moving animation elsewhere.
Full screenshots are not retained. Root may choose another safe point only in a
separately explicit observer revision, never silently seek a favorable pixel.

Original-payload identity plus native IMG routing is structural preservation of
encoded alpha/delay/loop, not screenshot proof of exact displayed delays or a whole
loop. Actual source metadata/encoded oracle must be root supplied privately and
qualified separately. This observer neither reads original bytes nor manufactures
that oracle. Painted sampler explicitly reports bytes/alpha/precise-delay/full-loop
proof false. Transparent screenshot pixels usually include opaque compositing;
canvas drawImage may evidence default-frame alpha but cannot prove animation timing.
Actual alpha-bearing representative/oracle is needed for an alpha claim. Whole
large-image decode is naturalWidth/height, ready, normal display and retained
original transport evidence; avoid another full original download just for a hash.

Historical rc16 painted-eight and rc20 post-review producers supply screenshot and
owner contracts only; they launch synthetic servers and inject app state, so never
execute them against the account. Their fixtures are not actual corpus/device proof.
Android common's screenshot(name) writes full screenshots: do not use it here.
There is deliberately no Android capture adapter yet; PC sampler is the first unit.

Local checks: `node --test qa/rc31-actual-image-observation/observation.test.cjs`.
Freeze includes safe source/docs/tests only. No raw captures, private inputs or results.
