# Exact rc.12 init-condition diagnostic

This ignored leaf changes no product source. `transform.cjs` admits only Worker
SHA-256 `8dda58e2b0b36e977428846d6bd2c2c9a27d932f430e45afb283c2bf8d378605`
from Git `eb8b6a528ee6598f648f2b98628d611050cb5aa2`.
Run `node qa/q1-init-diagnostic/transform.cjs https://PUBLIC-CANDIDATE-ORIGIN`
to produce `worker.generated.mjs` and `provenance.json`.

Exactly two substitutions are permitted: preserve a fixed allowlisted SAR error
code at the existing terminal failure call, and resolve the existing mux import
to `/media/mux-mp4.min.js` on the explicit candidate origin for a Blob module.
Unknown exceptions remain `SESSION_INIT_INVALID`. The normal Worker protocol,
media handling, clock binding and terminal cleanup remain unchanged. A successful
transform is diagnostic preparation, not actual source or decoder evidence.

For one coordinator-owned live replay, verify the page origin equals provenance,
keep the original native `Worker` constructor, and create one Blob URL from the
exact generated source (`text/javascript`). Substitute that URL only when the
requested absolute URL is exactly the current origin's
`/media/transmux-worker.mjs`, with no query/hash and module options. Pass the
original options unchanged. Do not intercept other workers. Restore the original
constructor immediately after that one construction, retaining an idempotent
finally restoration in case construction fails. The existing diagnostic observer
may read the terminal `data.code` and bounded cleanup counters; never serialize
messages containing fragment buffers. Close the player through its normal path,
await cleanup, then revoke the Blob URL. Keep this one-shot replay explicitly
separate from unchanged candidate execution evidence.

`node --test qa/q1-init-diagnostic/transform.test.cjs`: four passing checks cover
exact two-change output, wrong source and duplicate/missing anchors, credential or
non-origin URLs, and rejection of non-allowlisted exception text.

## Actual diagnostic execution

Two separate bounded attempts ran in the normal candidate owner, after prior helper restoration/normal close. The first exact-code-only Worker returned SAR_ASPECT_UNPROVEN. The second retained the same init validation and added one fixed aggregate before that check: SPS raster360x640, explicit Extended SAR2600:2601 (IDC255). No media buffers, SPS/PPS, account/file identity, credentials or URLs were exported. The aspect Worker SHA256 is8a02dd583c94017577a55a5085482d52f12071e53d990f51e3b9ebff2b19cd3e; its exact executed expression is retained separately. These are QA-transformed-worker diagnostics, not unchanged-candidate decode passes. Both normal closes show source absent, readyState0, selected/q1false and retirement settled; both constructors restored immediately, listeners/Blob URLs/groups released.
