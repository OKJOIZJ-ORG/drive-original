# Controlled TS buffering evidence — 2026-10-30

The controlled test below was observed in isolated real Chrome (`playwright` channel `chrome`, headless), public synthetic TS only. That driver accessed no user Chrome, account, production, or original Drive media. Separate live observations follow below. The temporary localhost server bound an OS-assigned free port and was closed with Chrome after the run.

The baseline module was read from Git `adbe705388c3cf6c3ad15984939f85eee34d7f52` ( full identity and SHA-256 values are in `synthetic-results.json`). Current and baseline imported the same other product modules. Both used the actual `openDriveQ1Source`, worker and native MSE implementation. Metadata callbacks delayed each preflight/postflight by450 ms; each source range delayed by900 ms plus one second perMiB. This produces roughly2.05 s per256KiB read before runtime overhead and3.8 s perMiB read. Fresh pre/post identity checks and abort signals remain active.

Each variant first filled its paused buffer until real backpressure was observed, then made no further range reads during two1.2 s pause observations. It played at2× for45 wall seconds. The long fixture is360 s /37,684,600 bytes. This warm-buffer trial measures sustained supply under latency, not cold-start speed.

| Observed | Baseline | Current |
|---|---:|---:|
| Media seconds advanced in45 wall seconds |53.735|89.910|
| Post-start waiting events |12|0|
| Time between waiting and playing events |18.113 s|0 s|
| Peak ahead, including a final GOP append |7.936 s|31.829 s|
| Range requests through end of sample (incl. probe/warmup) |26|15|
| Post-warmup sequential source read |256 KiB|1 MiB|

Both variants then passed close cleanup: source cleanup settled, worker terminated, source URL revoked, and no new callbacks/requests in the subsequent1.2 s observation. All worker input chunks stayed at or below64 KiB.

A separate short-fixture run without delay reached native EOF for both variants, then sought to4 s with generation2 and settled prior ownership, and closed cleanly. The six emitted fragment payload SHA-256 hashes matched exactly in order across baseline/current. The recorded first-run fragment `size` field is0 because it was read after transfer/detachment; hashes were calculated from an earlier copied buffer and are valid. The driver now captures size before transfer for future runs. Size was not used to establish payload identity.

Run: `node qa/buffering-browser.cjs`. The driver asserts a meaningful advancement improvement, source/worker/URL cleanup, bounded worker input, EOF/seek, and fragment equivalence. `synthetic-results.json` retains event timings, source ranges/metadata, stats and hashes. Its summary was calculated from those event timings after the run.

Boundary: this establishes a causal result for the combined30/12 s window + larger sequential read patch on this finite controlled workload. It does not isolate each change's marginal effect, establish arbitrary-bitrate/network performance, prove live Drive throughput, or qualify mobile/Safari. No production acceptance or deployment is implied.


## Actual signed-in Chrome observation (local patch, not deployed)

The user's existing production1.23.22 video (101,372,984 bytes /810.73s) was actually TS despite its MP4 extension and Drive video/mp4 MIME. Passive observation over355.3s recorded12 waiting events totaling29.214s; sampled buffer ahead ranged0.125–6.642s. The last100 media reads were256KiB each, with fresh metadata before and after each read. Raw sanitized evidence: baseline-observation.json.

In a separate owned tab on the same signed-in Chrome profile, only the local ts-player module was temporarily injected (imports still used the unchanged production core/worker/source). No original file or production asset changed. The same file sought to360s; observation stayed attached308.5s, with180 periodic samples through185.0s. One1.460s waiting event occurred immediately after that seek; no subsequent waiting event was recorded. After5s, sampled ahead stayed9.680–30.378s. Requests became1MiB. See patched-live-observation.json. The first tab was not paused/navigated/reloaded; the comparison was sequential, not a matched cold-start experiment. Test-tab media-view writes were disabled. Close settled source callbacks, terminated worker and revoked its URL.

## Shared general playback and checks

Q1/Q2/Q3 general playback explicitly opts into512KiB streaming reads and a1MiB two-block source LRU; discovery and subtitles retain their previous policy. The vendor cache stays independently bounded. A discovered race where a pending64KiB discovery read could poison the new cache was reproduced and fixed; a full-suite subtitle regression was fixed by limiting opt-in to playback. Initial failed log is retained. Final product tests1054/1054 pass. Tests cover byte equality, sparse/interleaved reads, EOF, cancellation, revision drift and phase transition. Source+vendor cache bound is1.5MiB at most, excluding transport/returned copies/output/native memory.

The existing native preload setting is a browser hint, not an instruction to override this app-owned MSE pipeline ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/preload)). Whole-file disk prefetch was considered but not added: it requires separate disk quota/eviction/revision lifecycle and duplicate-download avoidance, while the measured failure is already fixed by amortizing serial request latency. The30s threshold bounds exposed media time rather than all decoded memory; sustained slow links and all devices/formats are not guaranteed.
