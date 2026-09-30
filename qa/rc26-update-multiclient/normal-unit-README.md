# Normal update with multiple controlled documents

Implementation owner: gpt-6.1-sol high. Only app.js and tests/app.test.js were changed. No version, worker, other public source, shared memory, account/media, personal browser, commit or deployment operation was performed. Root owns integration and actual candidate follow-up.

Frozen app SHA-256 `931fc98f57273336d943ec9ddbf7fb3c78c8c44d93e4dcc4e56d6ac152fdff00`; focused-test SHA-256 `3a8a2ee5826a93946e52f71da87b1b886e5b9601eb0ae283fbd4e80a3a5cf1ea`. Root may subsequently change version metadata; the hashes here describe this unit before that integration.

## Discriminating baseline

The first two-tab producer qualified both controlled documents but incorrectly waited for the second document's update banner. Its startup check had completed before the fixed server switched, so that banner was not required to appear. `two-clients-baseline.cjs` and its raw result remain failed QA evidence. No product change preceded either baseline.

The v2 baseline removes only that extra second-tab banner predicate. The original actual normal Settings/version-check/single trusted update-button flow and45s/current-controller/40 exact cached-file guards remain. Two fresh anonymous Windows Chrome documents first qualify immutable rc24 public/cache bytes; one fixed server switch supplies immutable rc25. Both documents are controlled by the newly activated worker before the trusted banner click.

`two-clients-baseline-v2-results.json` reproduces the decisive failure: the new document runs rc25 but remains uncontrolled with no shell cache and one activated registration, no installing/waiting worker, through the45s deadline. The still-open sibling retains the exact saved pre-click controller, registration and active-worker object. Its `getRegistration()` again returns that same registration/active worker. The new document sees an already activated worker without a new installation/activation event. This locally observes reuse while a sibling holds the active worker. It does not identify the old worker in the separate actual signed-in failure, whose identity remains unknown.

The copied `normal-update-server.cjs` remains byte-identical to the preserved rc25 QA server. Original artifacts were not overwritten; its fixed24/25 source refs are `8a2894ee2c7aa85c9cb2ff992879f4580e15e2e7` and `7ba8e654fa38def8c8e00efcbf1600a4c8730c53`. The prior one-client native control passed289ms and remains valid historical evidence, not a newly rerun baseline.

## Responsible correction

Normal applyAppUpdate previously deleted the complete app shell and unregistered its scope even when the version check had already activated the new worker. The correction removes that destructive reset from this ordinary update action. It retains the registered worker and complete cache, then uses the existing `_update` document replacement. The existing worker's known-shell network-first path refreshes fetched shell bytes. No new worker protocol, cache allowlist, polling loop, grant or global/sibling reload was added.

Explicit forceReloadApp still invokes the unchanged exact-app cache/scope reset. Its intent and sibling application isolation remain unchanged. Normal update does not clear account state, immutable pins or sticky Q0/Q1 retirement uncertainty; a new document replaces those in-memory owners through the existing browser lifetime. Controller replacement's visible-error/retirement handling is unchanged.

The [W3C Service Workers Unregister / Try Clear Registration algorithms](https://www.w3.org/TR/service-workers/#unregister-algorithm) distinguish unregistering from clearing a registration still used by clients. This supports treating active-client lifetime separately from unregister completion. The reuse/no-new-claim observation above is actual local Chrome evidence, not a claim that every browser implements that mechanism identically.

## Before and after verification

The maintained actual-app VM normal-update test first failed because the old action deleted its complete shell; the explicit force-reset control passed. The unchanged test after the fix checks no shell deletion/unregister, exactly one same-document update URL preserving existing query/hash, account/generation/state/pin preservation and no local retirement waiver. The force-reset control checks only own shell caches and exact registration scope are removed and persisted user state is preserved. Five selected tests pass, including existing update supersession/deadline handling. `focused-before.txt` remains1pass/1fail; `focused-after.txt` is5pass. Syntax and scoped diff checks pass. The whole suite belongs to root and was not run here.

The fixed native server is a distinct producer: only the frozen current applyAppUpdate function is spliced into both immutable historical app.js versions. All other51 public paths stay unchanged; expected app cache SHA is recalculated, while every40 cached-file hash/controller/registration/45s guard remains. This isolates the behavior delta without claiming native execution of every byte of current rc26 app.js.

`two-clients-fixed-v1-results.json` passes2172ms after one trusted banner click: fresh rc25 document has activated/current controller and40 exact cache hashes, while the sibling remains rc24 with the exact same saved controller/active worker/registration and complete rc25 shell. `one-client-fixed-v1-results.json` separately passes137ms with current controller and40 exact hashes. Both fresh owned Chrome154.0.8037.58 instances and loopback servers closed. The current app hash is identical before/after each run. Immediate physical>1048576KiB and virtual>1572864KiB floors remain unchanged and pass for every native launch. No Playwright routes, provider, account, media or viewport emulation was used.

Modern-web-guidance search/list ran before editing; no applicable service-worker guide was supplied. Ballast recall revisited the index, standing scope decisions and current checkpoint/goal. Exposed Chrome MCP capabilities were inspected; its existing browser belongs to root, so the expressly requested fresh isolated native driver was used instead of operating that browser or the personal profile.

## Limits and curation

The prior actual25/26 normal-update failures remain failed historical facts. Root's ordinary-reload record matched only6 of40 cache entries (34 missing), so it is not a full recovery pass. This unit establishes a local multi-client mechanism and correction. Actual signed-in hosted update, session/appData continuity, interrupted offline update, active media during full worker replacement, other browsers/devices and whole QA-SW-01/REL-02 acceptance require their corresponding checks. No failure or uncertainty was waived.

`manifest.json` lists exact safe new producer/readiness/raw/test evidence paths and references the unchanged prior one-client control and root's safe actual failures. Root stages the curated files individually. Automatically refreshed server status files are last-run operational outputs; executed per-case reports contain their complete immutable server bindings and are the maintained evidence.
