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
