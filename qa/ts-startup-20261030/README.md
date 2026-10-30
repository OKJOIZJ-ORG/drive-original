# Strict TS startup runway — 2026-10-30

Confirmed production symptom (1.23.23): an AVC/AAC TS started at 14.303 s, exhausted its initial 0.853333 s range at media time 0.800165, waited 1.821 s, then continued without another wait during the following 27 s. The original observation is private `../buffering-20261030/strict-ts-release-observation-private.json`; this is not a new production acceptance run.

## Change

`media/ts-player.mjs` uses the existing bounded 1 MiB source read from the first stream batch. Previously it used 256 KiB until a complete fragment was appended. Each source read still passes fresh metadata checks before/after the body. Worker deliveries remain at most 64 KiB, serial transport ownership and the 30/12 s buffer policy remain intact. No readiness gate, retry or decoder fallback was added.

## Controlled browser evidence

Run `node qa/ts-startup-browser.cjs`. It generates a public 24 s AVC/AAC fixture with a 3 Mbit/s TS mux rate, starts its own ephemeral local HTTP server and isolated headless Chrome, and closes both afterward. It never accesses Drive, production, authentication or a normal Chrome profile. The baseline differs only in the previous first-read expression.

Transport model: 60 ms per metadata response; range latency 1,200 ms plus 300 ms per MiB. Real observed range response times were approximately 1,286 ms for 256 KiB and 1,509 ms for 1 MiB, plus the metadata checks. This is a controlled representative latency case, not an estimate of universal improvement.

| Result | Previous 256 KiB start | 1 MiB start |
|---|---:|---:|
| First stream read | 262,144 B | 1,048,576 B |
| First playing | 6.128 s | 4.860 s |
| Buffered end at first playing | 0.938666 s | 1.941333 s |
| Post-start waiting within first 10 s | 1, lasting 638 ms | 0 |

The baseline needed two small physical reads before a complete first fragment existed; the next 1 MiB request then outlasted that first fragment's remaining runway. The fixed run avoided both the extra initial request and early starvation.

Both variants also reached true EOF, produced exactly equal transmuxed fragment SHA-256 sequences, sought to 7 s while paused, and confirmed settled disposal with no new post-disposal requests. Worker inputs stayed within 64 KiB. Machine-readable evidence and generated fixture hashes are in `results.json`; the generated TS remains ignored.

Focused source/probe-retention/rapid-seek/diagnostic checks: **57/57 passed**. `git diff --check` passed. The coordinator owns the full suite, release, and any later production observation.

Fixture setup limits: x264 hard-CBR filler NAL units and the default delayed audio mux failed existing strict admission. The final fixture uses no filler NAL and zero mux delay. Product admission was not changed to accommodate those unsuccessful fixture setups. Intermittent normal-profile decode failures remain a separate unresolved issue.

## Same-file normal-profile candidate observation

The coordinator injected only the updated TS player into an owned normal-profile tab running1.23.23, then replayed the same104,747,584-byte source. First playing was12.925s, followed by30s wall observation without another waiting event; media reached30.381790s. The earlier unchanged run had first playing14.303s and a1.821s early wait. This is a network observation, not a controlled timing estimate; the isolated fixture above supplies the controlled comparison. Private raw observations remain ignored.
