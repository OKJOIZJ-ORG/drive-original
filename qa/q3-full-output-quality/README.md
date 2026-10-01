# Q3 independent full-output quality — 2026-10-02

Separate read-only timing findings are owned by `throughput-analysis.md` and
`tail-timing-analysis.md`. The short null-output tail runs do not supersede this
complete output quality receipt or establish Android realtime throughput.

Observed PASS for the complete local synthetic 180-second product Worker output.
This supplements, without repeating, the existing 3-second integration/oracles.
No product source, normal browser/account, Android, provider, candidate delivery,
production, Git history or other project was changed by this unit.

The existing `q3-product-integration` browser fixture/driver is adapted only in
this directory. It retains the actual `startGeneralWorker`, Q3 pipeline, MPEG4
WASM decoder, WebCodecs VP9 encoder, muxer and ACK-backed chunk transport.
The QA consumer sends each <=256KiB chunk to a synchronous file sink before ACK;
it does not build a whole-output JS array or raw YUV corpus. One conversion ran.
The source buffer is the existing 18,075,476-byte disposable synthetic fixture.
All served product media assets come directly from immutable Git object
`5174485b3c17d047259701bbdd889f9b0740f555` (rc.33), with exact hashes recorded
in `capture-results.json`. This is exact product-media execution, not full-app
choice/identity replay. The local harness assumes `nativeRejected:true`; root's
actual PC/Android same-fixture rejection evidence owns that condition. The local
exact WebCodecs input query independently returned false.

The first byte-identity preflight stopped before browser launch/output creation:
the clean working-tree Worker uses CRLF while the Git blob uses LF. Its hashes
and normalization discriminator are preserved in
`preflight-first-identity-failure.json`. Serving immutable Git bytes resolved it;
there was no failed or repeated conversion.

`capture.cjs` opens one Playwright-owned ephemeral headless Chrome profile,
serves only allowlisted assets and bounded fixture Range GETs on loopback, and
uses a 600-second capture/128MiB output limit plus failure cancellation.
It never opens or attaches to a normal/MCP browser/profile/account. Chrome
154.0.8037.59, Node and Playwright versions and native executable/dependency
hashes are bound by the receipts. The generated temporary profile pathname was
not recorded; isolation follows the fresh `chromium.launch` call, with no
shared profile/context argument. Browser close, server close and output file
descriptor close succeeded; source/consumer/worker cleanup settled with zero
in-flight reads, pending chunks/windows or invalid messages. Browser-native
heap retention and OS deletion of the temporary profile were not measured.

Observed conversion: 5,400 decoded and encoded pictures, one complete 180-second
window, 361 chunks/361 ACKs, 32MiB peak WASM heap, encoder queue 1, mux retention
405,818 bytes/30 samples. These internal maxima are not whole-browser resources,
thermal measurements or physical-device performance/throughput acceptance.
Output: 66,640,685 bytes, SHA256
`13daa94f723a7af036c709892d2640d018f271b4d1c0a5a90fbd37ad99ea5ad2`.
Source SHA256:
`cda53855c53bf1d608491eb96aa3abb0ff774cca2aa24cfe01447e295c07ed7a`.

`oracle.cjs` runs native FFmpeg/FFprobe 9.0.1 as independent source/output
decoders. Raw pictures stay inside native streaming filter buffers. PSNR aligns
decoded picture ordinal using a shared 1/30 timebase; all original timestamps
are independently compared through FFprobe before acceptance. Both inputs
contain exactly 5,400 pictures, and the PSNR log contains 5,400 comparisons.
The previously qualified independent MP4 geometry parser is reused without
running its old oracle. It independently verifies effective square pixels and
16:9 display even though FFprobe omits square SAR for VP9 MP4.

Observed full-frame oracle: 54.573547dB all-plane PSNR, 47.815807dB minimum frame;
retained 640x360 progressive I420/BT709 limited pixels on every decoded frame,
30/1 average cadence, 180.000000s duration, effective SAR1:1/DAR16:9 and no
unqualified side data. All presentation timestamps equal the native source at
FFprobe's six-decimal precision; largest CFR interval rounding error is
0.000000666667s. This is not a byte-exact original-clock assertion. Synthetic
38dB mean/33dB minimum thresholds retain the old qualification bar; they do not
prove perceptual equivalence or universal content/profile support.

Local driver syntax checks passed. Full product/old 3-second checks were reused
and not rerun. All eight independent oracle discriminators passed. Receipts,
per-frame PSNR log, probe metadata, compressed output and exact producer hashes
remain here. The output and large native probe/PSNR files can stay local while
their exact hashes are curated; they contain synthetic material only.

Reproduce with the bundled Playwright modules in `NODE_PATH`, then run
`node qa/q3-full-output-quality/capture.cjs` (requires a fresh output pathname;
wx prevents accidental replacement), followed by
`node qa/q3-full-output-quality/oracle.cjs`. No rerun is needed for the recorded
passing unit. This evidence does not establish physical Android output quality,
actual file combinations, long-form MSE EOF/presentation, thermal/battery,
performance distributions, patent clearance or whole-goal completion.
