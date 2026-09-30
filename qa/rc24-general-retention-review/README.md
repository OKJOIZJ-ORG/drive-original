# Independent scoped retention and Android telemetry review

No product/test/shared-document edit, commit, browser/device or heavy full-suite
run. Product author retained ownership throughout. Current reviewed player SHA256
`3d3820692114a3970e46a8ab3070df62bafa7a4f36d54b3e021a17e11833b3e7`.

Final scoped verdict: no unresolved critical blocker in this hardened diff.
The review identified/checked load-bearing corrections: owned mux edit-list media
time must translate tfdt+signed CTO to actual presentation RAP clock; per-leaf
reads must reject adjacent-sibling substitution; trun count/stride/mask must be
qualified; removal endpoints must remain below RAP across timescale/native
microsecond/floating precision; a future safe RAP must reach enough conservative
append credits to release the incoming batch's24MiB budget. Author implemented
these and reported19 focused affected checks passing, including actual reordered
AVC output matching onPacket output PTS, pressure failure and cancel ownership.
Those checks were not rerun by this reviewer.

Independent executed evidence: `binary-fields.mjs` / `binary-fields-results.json`
passes12 distinct small parser/retention counterexamples; per-leaf truncatedtkhd
and count2/one-sample trun scripts both reject under that same exact player source.
Earlier local results are preserved as v1/v2 savepoints, without pass promotion.
These are synthetic binary/function checks; native MSE audio/quantization and
actual Android corrected playback remain separate acceptance proof. Parser is
qualified to own mux output, not arbitrary fragmented MP4.

Reuse review: current public mediabunny exports offer Input/EncodedPacketSink
demux paths but no bounded acknowledged-output fragment RAP index. Existing
Q0 `qa/v2-07a-iso-tracks-rc11/parser.mjs` exports parseMoov structural track/
description reports, not presentation RAP/trun acknowledgement. Importing a full
second demux owner would add memory/lifetime work; its underlying leaf-bound
pattern was applicable and is now reflected in explicit p/end reads. Maintained
general-timeline has a separate original-file policy reader, not a public parser
export. Shared parser extraction remains a possible later maintenance unit.

`telemetry-review.json` verifies exact Android v2
`fb82921316fd76b323e5536c86653c6f16b3c072ec607c71eb03f687dbfc2b6b`
and fixture98 source/result identities. Requested privacy/trusted128/listener
scope is clean: fixed UI zone/type/key names; unknown/prototype key null; trusted
only;128 journal;9 fixed capped counters; fence mismatch names only;9 capture UI
and8 media listener removal; frame/timer cancellation; conditional owned fetch
restoration. Existing clone-body cancellation is best effort, so release is not
a synchronous native network-drain proof. No fixture/device rerun was needed.

Native removal behavior is consistent with
[W3C coded-frame removal](https://www.w3.org/TR/media-source-2/#coded-frame-removal):
the per-track removal end may extend to the next RAP. This source supports the
mechanism, not a native compatibility claim for the final implementation.
