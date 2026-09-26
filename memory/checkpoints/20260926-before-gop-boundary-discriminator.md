# Checkpoint — bounded Q1 preservation discriminator — 2026-09-26

## The story so far

Repo C:/extensions/Drive-Original/source, branch codex/v2-kickoff-diagnostics, last product HEAD ced16ef. V2-02A8b16fae, V2-02Be68d579 and V2-05Aced16ef are local product units; product Node299/299 and synthetic browser22/22 pass. No new candidate deployment; production and candidate mutation lock are unchanged.

QA-only qa/v2-07b-ts-q1 pins/executes mux.js7.1.0 MP4 bundle4d00d911c3186ca8921b8710de24cf4c4ea854e47c59d3c5164779ba83a2805f. Synthetic default options drop10 AAC frames; keepOriginalTimestamps preserves them. The priority local4MiB prefix preserves1022 VCL units/1586 AAC frames, but introduced1:1 SAR first failed strict metadata comparison. A generic bounded init-box adapter, used only after independently confirmed unspecified source SAR, changes just that introduced pasp type to free. Payloads, normalized PTS/DTS/duration, metadata and complete FFmpeg decoded frames/PCM then match.

Nine helper tests pass; independent review closed partial-write cleanup, wrong executed-artifact hash and private CLI-path leakage. Final synthetic/priority reports are producer-hash-matched in that QA directory. The source was read-only; current Drive identity/full-file hash was not revalidated. Generated private TS/MP4 derivatives were removed. This is bounded EOF-flush quality evidence, not product, incremental playback, seek, MSE/MMS, browser color or physical-device success.

## Decided

- D-050/D-051/D-052 remain active. No main merge/push/production replacement, original mutation, public sharing, billing or automation restart.
- Browser owns direct bytes/mutations; minimal Worker owns auth only. driveMutationsEnabled remains false.
- mux.js is a QA candidate, not an adopted or shipped product dependency. Preserve timestamps; do not accept silent AAC trimming or fabricated aspect metadata.
- Prioritize incremental bounded GOP/PES and seek ownership before product Q1 integration. FFmpeg metadata is a QA oracle, not a browser runtime solution.

## Waiting on the user

No new decision needed for local work. Current isolated candidate is unauthenticated; current Google/device acceptance and production transition are still separate user-controlled gates. Historical iPhone auth confirmation is not media proof.

## Next first action

Use only synthetic-bframes-audiolead.ts to compare arbitrary per-chunk mux flushes with GOP/PES-aligned boundaries, inspecting mux.js ElementaryStream flush retention; require no lost/duplicated coded frames or timing before building the bounded TS seek owner.

## Tried

- Automatic Google preview and viewed-on-open were false success paths; fixed in V2-02A/B, not priority media fixes.
- Legacy Drive writes guessed success; V2-05A now independently reads remote state and retains durable origin evidence.
- Browser resource failure occurred earlier; the later full synthetic22/22 run succeeded with an existing bounded seed. No OS settings/user processes changed.
- mux.js default timestamp mode discarded synthetic leading AAC; keepOriginalTimestamps preserves it.
- Priority unspecified SAR became explicit1:1; strict comparison caught it, adapter preserves absence without touching SPS or media bytes.
- FFmpeg container-relative -ss windows gave inconsistent cuts; one bounded decode plus ordinal windows and independent packet timing replaced that harness.
- Rollback: remove only QA candidate files/dependencies if rejected; current product commit remains unchanged, and no remote/original recovery is needed.
