# Actual rc.10 priority playback observation

`results.json` records the connected user Chrome session on the approved candidate.
It is a bounded real-account desktop observation, separate from the synthetic
50-cycle proof and the full native/local priority preservation comparison.

Repeat only when new evidence or a relevant change justifies another private read:

1. Use the authenticated candidate, confirm rc.10/current controller and immutable
   `DRIVE_MUTATIONS_ENABLED === false`. Open the user-supplied target in its folder
   through the normal UI. Do not copy credentials or change volume settings.
2. Observe `requestVideoFrameCallback`, exact selected filename/known size, Q1
   route, no visible error and no compatibility iframe. The recorded38.888s
   sample was taken after playback began; it does not measure startup latency.
3. Privately retain selected file/account/auth/data ownership and GET metadata
   `id,version,size,modifiedTime,mimeType,md5Checksum` in a CDP remote object.
   Never return these private values or store them in a project artifact.
4. Send ordinary UI digit shortcuts1,5,9. For each, await a presented frame within
   two seconds of `1609.408 * percent / 100`, with `video.seeking === false`,
   using a25-second observation bound. Record requested/actual media time, route
   and visible-error boolean. The measured errors are about13–20ms; the observer
   tolerance is broader. Frame counters reset across source replacement and do
   not prove reuse of one native decoder.
5. Under the same private owner fence, GET the metadata again and return only
   equality/presence/known-size booleans. This covers the seek interval, not an
   atomic immutable source or equality to a previously downloaded local sample.
6. Escape through the UI, verify the player is hidden, then await `q1Retirement`
   for at most3seconds. Require settled true plus idle/null Q1 owner, stopped
   source and cleared app media/temporary/pending owners. Release the private
   CDP object group. This is protocol-confirmed cleanup, not total heap/native
   decoder-memory measurement.

The CDP event buffer lost earlier entries. Its retained136-event tail contains
14 candidate-media206 responses from the service worker with finite ranges and
the known208001508-byte total. Its14 canceled loading events are page-wide;
neither their attribution nor complete run traffic is claimed. No noncanceled
failure exists in this tail; that is not a full-run error absence assertion.

Before the first seek, media time was248.891003. No uninterrupted299s discriminator,
EOF, natural credential expiry, sleep/wake, physical iPhone, audible output,
full-format or broad stability acceptance was performed here. Earlier native
preservation evidence remains separately owned by `qa/q1-priority/`.

## Natural renewal continuation

`renewal-results.json` is a later independent actual observation on the same
unchanged candidate. `observe-renewal.js` is its exact public main-world source
(hash its trimmed text). It returns a private CDP object with `report()`/`stop()`;
keep that object in its own remote object group. It reads app/video state once
per second for at most12minutes/720samples, never tokens or provider bodies.
It changes neither clock, credentials, product timers nor storage. Its initial
remaining285869ms expires naturally; no forced refresh is called by the observer.
Normal UI playback and the product's own renewal remain the behavior under test.

This run observes a newer credential revision/expiry at257013ms and a3569728ms
expiry extension. Account/auth/data/controller ownership and read-only mode are
stable across392samples. Continuous active samples advance from0.400176 to
360.241573s with zero nonadvancing adjacent1s samples; largest wall gap1015ms.
106active samples occur after the old expiry. Actual rVFC presents310.888s,
and a subsequent50% UI seek presents805.488s within the2s observer band.
That seek is not claimed frame accurate. Close retirement and all checked app
owners clear again. `stop()` removes the observer interval; its object group is
released. The safe aggregate excludes account IDs, credential values and revisions.

The partial response capture observes five credential200s and103known-size206s;
five responses are not five refreshes. Event loss prevents full trace claims.
Once-per-second progress cannot exclude every subsecond stall. One observed
natural boundary does not prove hour-long playback, device/sleep-wake behavior,
all formats or the cause of the historic local299s failure.
