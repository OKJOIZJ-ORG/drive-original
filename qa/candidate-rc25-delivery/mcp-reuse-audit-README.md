# Fixed25 delivery using the existing MCP profile

Public HTTP proof passed52 exact committed assets (including empty `.nojekyll`)
and six private404 routes, source `7ba8e654fa38def8c8e00efcbf1600a4c8730c53`,
version `1.22.0-rc.25`. No new Chrome was launched. Original guard refusal at
19:11:59UTC remains in `audit-memory-guard.json`: virtual748084KiB is below the
exclusive1572864KiB launch floor. The child MCP server additionally encountered
the root-owned profile lock; its preserved diagnostic is separate from the memory
floor. No retry, profile kill, `--isolated` launch, floor waiver, personal-browser
operation, cache/cookie purge or codec metadata write was performed here.

Browser execution was root-only through its already-working MCP server, page1.
`results.json` merges actual saved root results with the verified public HTTP rows.
Online shell/cache checks passed40hashes/eight uncached archives/anonymous candidate
flags; first-navigation measurement27922ms was inside45s. Offline v1/v3 failed
because `navigator.onLine` returned true after reload. The preserved v2 post-reload
read confirmed25/controller/anonymous flags/zero errors and1201ms load measurement.
Actual v4 after normal offline-emulated reload confirmed the same shell and zero
errors, while an uncached same-origin `.nojekyll` request failed TypeError in4ms.
After online restoration, the exact same path returned200/zero bytes in243ms.
That network discriminator establishes blocked-network reload despite the unreliable
online boolean; no product condition was relaxed. Cleanup reports online=true,
temporary globals removed and no cache/cookie changes. The pre-navigation inspection
did **not** execute: configured tool `filePath` was rejected before execution.
No result proves a genuinely fresh context.
`about:blank` has an opaque origin and cannot establish that candidate storage or
service workers were previously empty. Reused-profile proof must keep that limit.

Reproduction sequence for the same bounded ownership (not an instruction to rerun
passing actual evidence):

1. `evaluate_script` page1 with `mcp-reuse-audit-preflight.function.js` and
   `waitForStableDom:false`. It refuses a page that is no longer `about:blank`;
   reports scoped API/storage inspection or UNKNOWN for opaque origin. It never
   reads cookies, account tokens or unrelated browser storage.
2. `navigate_page` page1, URL candidate root, timeout45000, and `initScript` equal
   `mcp-reuse-audit-init.js`. Initial listener stores fixed PAGE_ERROR codes only.
   Evaluate `mcp-reuse-audit-page.function.js` with `waitForStableDom:false`.
   Its45s deadline starts in the navigation init script, not at later evaluation.
   It requires25/controller/candidate=true/Drivewrites=false/account=false,
   exactlyone25shell cache,40 committed cache hashes and8 source archives absent
   from that cache. No static/media fetch is initiated by the browser function.
   `firstNavigationMs` includes cache hashing; it is not cold-media latency.
3. Preserve this sanitized online result and root console-error inspection.
   `emulate({pageId:1,networkConditions:'Offline'})`; reloadpage1 with the same
   init script/45000timeout; evaluate the preserved derivative
   `mcp-reuse-audit-offline-network.function.js`, then restore online and repeat its
   exact probe path as the200/zero-byte positive control. The original
   `mcp-reuse-audit-offline.function.js` remains unchanged historical failed producer.
   The new derivative has not itself been executed; root's actual v4 tool output
   proves the discriminator from which it was prepared. Require25/controller/
   anonymous flags/zero page errors and uncached TypeError under network blocking;
   do not require `navigator.onLine:false` after reload.
4. In a finally path call `emulate({pageId:1})` (omitted networkConditions resets
   network throttling/offline per the tool contract), then evaluate the cleanup
   function and require `online:true`. It removes only the two temporary globals.
   Root must restore online even after navigation/evaluation failure. Page/profile
   remain open; the anonymous candidate shell cache is retained. Combine online
   and offline error counts, including preserved console errors, without exposing
   account information.

HTTP producer and generated bindings are fixed-Git, independent of a subsequent
metadata HEAD. Reproduction: run `mcp-reuse-audit-http.cjs` (public GETs only), then
`mcp-reuse-audit-page-generator.cjs`, then `mcp-reuse-audit-verify.cjs`. Passing HTTP
proof need not be rerun just to execute the prepared browser functions. The generator
tightens the deadline to the navigation init timestamp without replaying public GETs.

`mcp-reuse-audit-merge.cjs` strictly validates saved HTTP/page/v4/control/cleanup,
preserves old failed outputs and creates `results.json` only when absent. Its
`auditProducer` and `producerSha256` identify the actual merger; `evidenceFiles`
bind each precursor producer/output including the old failed function and new
unexecuted derivative. V1/v3 are never relabeled successful. Preflight policy failure,
no-fresh-context, online-boolean limitation and restored-online cleanup are explicit.

Existing `finalize-source-readiness.py` checks deployment/control/package,52assets,
40cache,8uncachedarchives,six404,anonymous flags/offline/error0 and hashes all source
and preferred-source records. It then writes private `media/audio-codec-build.json`.
That write remains root-owned. Its hardcoded auditProducer currently names the
fresh-context canonical audit; an adapted finalizer must cite this actual MCP reuse
producer/merged evidence and explicitly retain `freshContextProved:false`. Do not
manufacture a fresh audit or run it before root's browser rows have actually passed.

Local verification validates the HTTP producer hash,52Git hashes,40cache expected
hashes/eight archives, four browser function syntaxes/init syntax, and unchanged
launch-floor facts. It performs no browser/account/media/device operation. Curate
only the exact `mcp-reuse-audit*` files and original guard as relevant evidence;
keep deployment-private/token-bearing logs outside public exports.
