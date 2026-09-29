# QA-only Q1 source clock and metadata integrity fork

Status: container preservation demonstrated on 13 bounded synthetic controls.
Generic product/native presentation acceptance remains open. Nothing here is
integrated into `media/`, the app, a worker deployment, or a release.

## Root mechanisms and local changes

Pinned Mediabunny 1.60.0 lost source DTS at its packet API, reconstructed DTS by
sorting PTS, and wrote fragment `tfdt` from minimum PTS. The local fork carries
actual source DTS/decode duration through packet side data and uses first DTS for
`tfdt`. Negative DTS is represented with the existing legal media-time edit;
signed composition offsets remain signed. A common exact rational timescale is
used for both tracks, avoiding arbitrary per-track re-zeroing or rounding.

AVC/HEVC full-range absence was defaulted to false and then emitted as a color
declaration. The parser now preserves `undefined`; real declarations remain.
The admitted QA path is AVC with AAC or AC-3. Non-square AVC SAR is retained as
the original ratio, rather than rounded square-pixel dimensions. The separate
90-degree fixture verifies an actual nonzero transformation.

TS video with multiple access units sharing one PES timestamp is explicitly
ambiguous and rejected, rather than inventing a decode schedule. Other input
container/codec combinations are not qualified by this fork. Source ISO edit
structure is checked by the inherited timeline policy; unsupported edit lists
are rejected. Common browser-axis mapping keeps negative preroll available while
preserving one explicit mapping back to the original movie clock.

## Evidence

- `oracle-results.json`: 13/13 cases; exact integer/rational source PTS/DTS,
  coded picture and non-parameter NALs, identical parameter-set population,
  AAC coded payloads, raw decoded pixels, declared/absent color, SAR, rotation.
  Controls include original 360-frame B-frame TS, 144-frame B-frame MP4, absent
  and declared color/no-B, new B/VFR/audio-lead TS/MP4, trim/negative DTS,
  empty edit, negative CTO, actual 90-degree rotation, exact subpixel SAR2600:2601, and one known picture.
- `independent.mjs` uses FFmpeg/FFprobe and its own raw ISO box arithmetic;
  it does not import the modified library. MP4 packet/extradata hashes also
  remain in each report; TS Annex-B/ADTS packaging is compared by payload.
- `bounds-results.json`: 5/5 backpressure/buffer cap/ACK timeout/ACK cancel/read
  deadline controls. Original source and append owners drain. Observed read
  cache peak <=262144 bytes, packet buffer peak <=159127 bytes on the corpus;
  the intentional packet cap fails before unchecked growth. These are explicit
  owner counters, not proof of total native/JS heap or unbounded sample tables.
- `native-results.json`: isolated installed Chrome, nine three-position native
  playback/rVFC cases and an append cancellation control. The AC-3 control is
  explicitly unsupported by native MSE; it still passes container preservation.
  `native-broad-producer.mjs` is the exact saved broad-run browser producer.
- `native-one-picture-color-results.json` and `native-diagnosis.json`: the
  decisive original/original and same-picture native color discriminator.

## Native/oracle limits that must remain visible

Default FFprobe rewrites edited and signed-CTTS timestamps. Even
`ignore_editlist=1` is not a raw signed-CTTS oracle. The raw `stts/ctts/elst`
versus `tfdt/trun/elst` comparison is exact in all controls; default FFprobe
movie-clock disagreements for trim and negative CTO are retained, not hidden
by changing original per-track clocks. Relevant primary implementation:
https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/libavformat/mov.c
(`mov_fix_index`, `dts_shift`, and `min_corrected_pts`).

Native direct-versus-direct controls are byte-identical in displayed RGB. A
single encoded picture (identity 0) removes frame selection ambiguity: direct
Chrome reports SMPTE170M/limited; MSE reports BT.709/limited, while the original
and remuxed container/SPS both declare BT.709. Their mapped PTS differs only by
0.333 microseconds; displayed RGBA mean absolute difference is 4.95669. This
proves a cross-route native interpretation difference, not that rewriting
Q1 metadata to match direct playback would preserve the original. That rewrite
would be wrong. Dynamic VFR/trim native frame selection remains a separate
unknown; matching rVFC timestamps is not independently proven picture identity.
Do not infer original-quality equivalence merely from playback, equal container
metadata, or equal raw FFmpeg decode hashes.

## Reproduction and source availability

1. `python qa/q1-clock-color-integrity/build.py`
2. `python qa/q1-clock-color-integrity/generate-fixtures.py`
3. `node qa/q1-clock-color-integrity/oracle.mjs`
4. `node qa/q1-clock-color-integrity/bounds.mjs`
5. Set `NODE_PATH` to the existing bundled Playwright packages; run
   `node qa/q1-clock-color-integrity/native.cjs`. `Q1_NATIVE_CASE` runs one
   targeted fixture; `one-picture-color` produces the decisive color report.
6. `node qa/q1-clock-color-integrity/diagnosis.mjs`

The preferred-source archive, exact eight-file patch, shared source from the
package's exact Git commit, MPL-2.0 notices/license, build binary/version and
hashes are retained. The npm tarball omits `shared/*.ts`; those five files were
retrieved from the package's recorded upstream commit, with exact hashes in
`shared-source-provenance.json`. No npm lifecycle hooks ran.

The DevTools MCP managed profile returned a profile-lock error. The parent had
authorized the existing purpose-built isolated headless Chrome QA fallback.
No personal Chrome profile, authenticated media/account, volume, deployment,
tracked product file, or main/push operation was changed.
