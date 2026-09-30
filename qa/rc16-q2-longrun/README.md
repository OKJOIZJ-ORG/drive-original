# rc.16 automatic Q2 420-second contiguous playback qualification

This leaf uses immutable public Git source
`e57d7b5b3154a2a838d01f631cf71fa063044280`, materialized byte-for-byte with
`snapshot-public.cjs`. Its51 public files are bound before and after each run,
independent of later working-tree rc17 edits. The served assets and worker bytes
are never rewritten. Installed isolated Chrome/driver versions are in raw records.
This is local synthetic actual-app/SW proof, not account/device/corpus/production
or audible-speaker acceptance.

## Protocol and provenance

`fixtures.py` creates a finite 420.000000-second original: AVC320×180/24fps,
no B frames, limited BT.709, plus stereo48kHz AC3. Independent ffprobe confirms
10,080 original video frames and13,125 audio packets. Fixture SHA256 is
`7004b0fc3b45673450e96a1852d2ee858b7af888e10cd21baa8a138e55e2f692`;
the 35,308,089-byte file is regenerable and excluded from this curated leaf.
Exact FFmpeg command/version, original movie/stream metadata and first/last
audio packet clocks remain in `fixture-provenance.json`.

The adapter reuses the maintained actual-app/SW/provider and retirement code in
`qa/rc15-lifecycle-qualification/qualify.cjs`. It opens the original through the
normal automatic Q0→Q2 planner; no manual Q1 fallback, QA seek or short endpoint
window substitutes for uninterrupted playback through299seconds. After normal
initial fallback/restoration, the latest ready owner and finite original-clock
timeline are required. Native1× playback then runs to real HTMLMediaElement
`ended` and source-clock420, followed by settled actual app/SW retirement.
All frame samples, owner/session identity, source-clock progression, buffer
removal/backpressure and native process observations are retained.

The native rVFC observer records presented media/source timestamps by second,
with explicit295/299/301/360/419second checkpoints. The native AudioEncoder
observer records only scalar input/output timestamps, sample counts, codec
configuration and close; it forwards native methods and output callbacks
unchanged. Telemetry leaves through an owned worker inspector binding, never
extra product Worker messages. A QA-only initial start handshake installs the
observer before the original start message; it does not alter media timestamps,
seek the timeline or rewrite product worker bytes. These are native encoded
audio clocks, not proof of audible output or bit-perfect transformed audio.

Network metadata and Fetch interception remain enabled, with zero response-body
budgets on exact owned page/SW/future worker sessions. No mid-playback Network
reset or GC-heavy observation is used. Prior native-resource evidence shows
these caps alone do not eliminate every instrumentation/native cache; current
PID/target observations carry that limitation. Host guards stop at less than
1.5GiB commit or1GiB physical headroom. Only owned isolated browser/server
processes are closed; personal Chrome, accounts, OS settings and volume are untouched.

## Results and retained first attempt

**PASS** in installed Chrome154.0.8037.58:420.094seconds of contiguous1×
automatic Q2 playback from the normal restored source position0.206808s.
Native rVFC media/source timestamps are exactly299.000000 and360.000000;
last presented video is419.958333, with10,075 callbacks and10,076 native
video frames. No seeking/seeked events or pause occurred before native end.
The native element ends at420.0065 (Opus312-sample pre-skip compensation),
while the original-source UI clock correctly ends420.000000. Pause and ended
events are observed at the same native endpoint, not a synthetic timer stop.

Native audio input/output starts−5333µs, consistent with the original AC3
preroll packet clock. The selected native encoder processes20,160,000 input
frames (420×48,000), last Opus packet timestamp419.994667s/duration20ms,
and closes with zero timestamp reversals or output gaps. Final original-source
reads cover exactly35,308,089bytes; all23,205 admitted packets complete
(10,080video +13,125audio), with no pending worker reads/chunks/windows.
The pipeline finalizes to buffered-to-end and terminates its worker. It records
392buffer removals/1,483waits, peak ahead30.866401s, retained append peak
3,045,062bytes, WASM heap33,554,432bytes and peak mux retention96,212bytes.

Post-long app/SW retirement is settled: source owners, cleanup fences, Q0 pins,
acquisitions, workers and object URLs are zero. Both created workers terminate
and both URLs revoke. Minimum observed host headroom is2.213GiBcommit/
2.868GiBphysical. Context/browser close and all owned process release are
recorded. These process observations are not a general native-memory ceiling.

`summary.json` and the successful raw record carry native end/frame/audio,
complete original audio decode count, buffer bounds, exact source-owner lifetime
and settled post-long cleanup evidence. `summarize.cjs` rejects a partial or
substituted short run and checks the original420second movie/sample-clock fences.

The first attempt progressed normally to about154seconds but installed no
AudioEncoder observer: the QA filter named `general-worker.mjs` while automatic
Q2 uses `audio-general-worker.mjs`. Its original adapter/gate/raw record are
preserved. It was intentionally stopped early by closing only its CDP-owned
Chrome browser PID after confirming its process identity. The resulting
closed-target failure is a QA setup stop, not a product/native-resource defect.
The corrected filters target the actual Q2 worker entrypoint and retain all
native telemetry. Historical cold decoder-open failures remain separate.

## Exact reproduction and curation

```powershell
python qa/rc16-q2-longrun/fixtures.py
node qa/rc16-q2-longrun/snapshot-public.cjs
node qa/rc16-q2-longrun/longrun.cjs
node qa/rc16-q2-longrun/summarize.cjs
```

`evidence-manifest.json` binds the exact producers, raw attempts, fixture/source
provenance and existing maintained dependencies. Stage only exact files listed
in `curated-savepoint.txt`, preserving bytes with scoped Git attributes. Exclude
the materialized public copy, regenerable fixture, SDK/node_modules/cache,
private account/browser state and original media. A successful run here does
not promote the dated69-case acceptance matrix or the normal-runtime native
memory/device/account gates.
