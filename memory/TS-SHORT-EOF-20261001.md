# TS short EOF and closed-session play intent

Observed actual29: the corrected passive performance plan reached14 actual
rows,12 TARGET_FRAME followed by two failed opens of sample5. The displayed MKV
is actually TS; both opens reported SEEK_GOP_PRESENTATION_UNPROVEN with native
ready0/no duration/no decoded frame. The following planned seek was unattempted.
The frozen14-row result remains unchanged and does not prove p95 acceptance.

Confirmed bounded diagnosis: original head/tail reads found a true-EOF final
singleton IDR. Its strict syntax/DTS/uniquePTS/reorder/IDR conditions passed;
all preceding30-frame GOPs passed. The canonical >=3-frame presentation guard
rejected that terminal GOP. Safe diagnostic
`qa/rc29-resume-20261001/actual-ts-gop-diagnostic-safe.json` is6743 bytes,
SHA256028a35db032d1a90e087e14a2757c8441b2b93195f277232e7c69ee44365ec4f.
Two media GET/five metadata GET returned1051348 bytes; cleanup settled and raw
buffers were cleared. Both ranges had CORS-hidden range headers with exact
known-size/exposed Content-Length validation. This is not a visible
Content-Range assertion or full-file/decoder proof.

Local product30 correction: only exact EOF allows1/2-frame terminal GOPs.
Singleton duration uses the actual adjacent predecessor DTS. End seeks retain
the preceding validated original GOP as decoder preroll; the worker observes
its own cadence. Shared seek-input validation and all identity/read/clock/byte
bounds remain. EOF singleton and predecessor use one existing bounded output
credit. No original picture is discarded and no trusted timing scalar is added.

Local evidence:141 canonical tests pass. Native FFmpeg public synthetic301/302
frame TS/MP4 comparisons preserve decoded frames, PCM, H.264 VCL/SPS/PPS, AAC,
rawPTS/DTS and observed final duration. Fixed29 core fails the same four
startup/end cases; rebuilt core passes. This evidence is synthetic and does
not yet establish actual candidate30 playback. Exact public core SHA256 is
2cbd017339c2261eca161f013588b3e0106ba33888b1c78bff8ceb806ade126a;
worker3962b20bf6f36e831bc0a3296cbdd65a9225b20b70250f3060cb62ddc4aaf444.

Separate responsible-layer fix: full media reset clears pendingPlay; opening
a replacement video saves and restores its requested intent after reset.
Source-only unsupported Q0-to-Q1 handoff retains intent. Three new regressions
cover failed-close retirement/late callbacks and replacement video/image
ordering. Complete current local product724/724 passes with stable inputs.

Current actual boundary: candidate29 remains public10f1dd2; product30 is local
pending independent review/source commit/delivery. Browser-private same-file
key `drive-original.qa.rc29-ts-failed-target` is retained for fresh qualification
after normal update. It proves recoverable same ID, not independently proven
unchanged original bytes across the update. Root must record actual PC/Android
replay, performance and final finite acceptance separately. Production remains
1.21.0/e08989a; no merge/push/production/new grant authority is added.

## Actual rc.30 continuation — 2026-10-01

The preceding current-boundary paragraph is historical. Public candidate30 is
aa46bd083ce8c21f55cf7d9a4759f0d6709188c2, Worker
29abe17c-fc7a-40d7-8802-06904d15677c. Normal PC and Android update, account state
preservation, public source and current shell cache checks passed. Committed
source31 4a484e6f839d2e6c3eb83503acb08147362cb011 adds an account JSON read deadline
and version change; its media core is unchanged. Its delivery is still pending.

The exact browser-private failed29 target was found through normal PC search.
Fresh metadata before and after the replay confirmed the same ID, stable fields,
revision and checksum. The old29 full revision was not retained, so unchanged
original bytes across29-to30 remain unknown. Actual PC30 first frame14.160s,
paused50% seek14.305s, near-EOF target frame9.601s and reopen12.885s passed.
Playback reached native trusted ended and current Q1 ended, source bootstrap
offset equalled44,117,772 bytes, the worker finished, tail buffering reached
601.066666667s and final-window frames were presented. Closing released owners.
Exact last original sample is UNKNOWN; positive audio counters are decode
diagnostics, without a physical audio or fidelity claim.

Safe evidence: qa/rc30-ts-device-replay/actual-pc-same-ts-replay-safe.json,
1,396,541 bytes, SHA256
9cb71a337b80bc184dd79b2f0ff7b55019538988651641b847945f9580490e45;
the adjacent summary preserves phase-level EOF observations before final close.
The separate broader PC30 performance run retains its15s seek timeout and
24-of30 actual attempts. This successful replay does not erase that failure or
complete its original performance plan.

Android attempt1 failed before opening because its current folder lacked the
target. Frozen additive attempt2 used the private exact folder path, confirmed
source/account and presented a Q1 TS first frame15.894s (15s deadline false),
then stopped before seek with NATIVE_TARGET_UNAVAILABLE. Owned player/session/
forward cleanup passed. Additive attempt3 is being prepared against observed
player chrome and normal transport semantics; no successful Android seek/EOF
claim is made yet. Private recovery inputs and raw logs remain excluded from Git.

Android additive attempt3 subsequently completed the same exact target with
metadata before/after and all owned cleanup qualified. First target frame was
14.222s,50% seek19.799s,90% seek16.002s, near-EOF9.409s and reopen16.002s.
The15s failures remain failures. Native trusted ended/current Q1 ended, source
offset==size44,117,772, worker finished and final-window frames were observed;
received/released source bytes both1,418,836. Exact final original sample remains
UNKNOWN, physical audio fidelity NOT_TESTED. Input was native OS injected on the
actual Android tablet, not human-finger, phone-width or iOS proof. Raw safe result
SHA34d419002a1ad6851728ca69a458b511bb6482ccc5e97a5c035974bffb2b0e08;
the adjacent attempt3 summary SHA
165001aa51b88763f450bbe258e3fd74de438b0520089ea70c8ab50c862834d3.

Source31 was then delivered as Worker c9076471-9667-4a9e-847d-f313a8e82cb3.
Actual normal PC/Android updates preserve account/key/writer/full projection/cache
and match31 public/current shell bytes. The fresh full30 PC performance plan
completed20 actual startups and10 actual seeks,29 TARGET_FRAME/one Q1 seek90
15s timeout,20/20 closes released. Its failure and unknown cold/warm cache
conditions remain explicit; full-plan execution is not complete performance
acceptance. Safe raw SHA
af79f1a3b33493b04afd04372513ed5f8ca8d7fd7ae445568fd25415e85c85d5
in qa/rc31-resume-20261001/actual-pc-full30-performance-safe.json.
