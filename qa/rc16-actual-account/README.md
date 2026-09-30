# Actual rc.16 paused TS seek — retained failure

Root applied the normal existing-account candidate update and independently
checked the controlled shell's app/index SHA against fixed `e57d7b5`. No new
login, grant or original mutation occurred. The live function has the composite
media-session/attempt/source-generation presentation key.

Trusted paused10/50/90% seeks each presented a target rVFC within0.25seconds.
After50%, native seek and the app watchdog settled at ready4 but the loader
remained visible. The repeated50% trial reproduced it on current key `1:q1:8`.
One trusted Space resume, with source/seek generations unchanged, produced more
frames and cleared the loader. This distinguishes a late current presentation
callback waiting for another paused frame from the prior stale-source key issue.

`results.json` transcribes privacy-safe developer-runtime readbacks, not an
exhaustive event trace or retrospectively successful acceptance. The target
observer is reused from `../rc15-actual-account/seek-observer.expression.js` with
the explicit rename/terminal-LF transform. The first installation before file
selection was discarded before any watch. Escape closed the owner and zeroed
native ready/buffers; `src` attribute was absent but `currentSrc` still truthy
in the later idle readback, so full currentSrc emptiness is not claimed.

`verify-record.cjs` checks the saved producer transformation, immutable source
blobs, frame tolerance and failure/contrast record consistency. It does not
replay Google playback or prove a repair. All temporary observer callbacks were
cleared and the global deleted. The whole goal continues.
