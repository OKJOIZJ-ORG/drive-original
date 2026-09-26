# Checkpoint — browser-safe SPS aspect metadata — 2026-09-26 22:27

## The story so far

Repo C:/extensions/Drive-Original/source, branch codex/v2-kickoff-diagnostics. Last product ced16ef; prior QA dd5b856. Added validated SPS aspect metadata, seven tests and a PSI alias-export compatibility fix found by the existing browser bundle execution test. Parser/Q1/static/adapter integration161/161 and independent SPS review51/51 pass. Nine incremental contrasts and six chunking reports regenerated against final sources.

Product Node299/299 and browser22/22 remain last product checks. Candidate rc.4/3597e63, mutation lock and production unchanged. Priority arbitrary4MiB source/output decoder diagnostics still mean preserved=false; equal concealed buffers are not proof. No private media read in this unit.

## Decided

- D-050/051/052 remain: direct bytes, separate free B-auth, no push/merge/production/original mutation.
- Missing/IDC0/zero Extended SAR are unspecified; reserved codes remain unknown. Metadata does not yet authorize init rewriting.
- QA-only bounded TS owner and metadata are prerequisites, not shipped playback or full-format support.

## Waiting on the user

No new local decision. Current isolated candidate unauthenticated; actual Google/device acceptance and production approval remain separate gates.

## Next first action

Inspect qa/v2-07b-ts-q1/preserve-sar.cjs and mux MP4 init structure; implement a bounded browser-safe adapter that binds exact validated source SPS/PPS and coded geometry to the init before preserving unspecified SAR.

## Tried

- Arbitrary TS/PES/inside-IDR flushes duplicate video; IDR alone fails cross-PES ADTS/VFR/audio-empty cases.
- Per-PES AAC tolerance drifts; use the global sample clock.
- FFmpeg exit0 plus equal buffers can conceal errors; require zero error-level diagnostics.
- User callbacks can abort/change generation; recheck every boundary and reject/drain async consumers.
- Existing browser builder strips export declarations, not export alias statements; const export preserves shared PSI API and executable bundle.
- Rollback removes only these QA units; no remote/original/product recovery is needed.
