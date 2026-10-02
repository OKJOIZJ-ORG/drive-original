# rc36 exact-source delivery

Source is pinned to `d3f78f321a804f582668dde1b7cd3e0f949b24c9`, version `1.22.0-rc.36`. The reviewed free candidate was deployed once as Worker `12fd17ea-0b16-4f14-ada3-0bda639291ec`. `source-readiness.json` and the final `results.json` bind the successful technical delivery to this exact source. Root authorized and owns deployment and PC execution; creating or reading these drivers does not authorize a replay. Existing rc35 evidence is untouched.

The retained producer sequence is shown for review, not automatic replay after this completed delivery:

```text
node --test qa/candidate-rc36-delivery/guard.test.cjs
node qa/candidate-rc36-delivery/delivery-guard.cjs
node qa/candidate-rc36-delivery/audit.cjs --prepare
node qa/candidate-rc36-delivery/delivery.cjs materialize
python qa/candidate-rc36-delivery/build-release.py d3f78f321a804f582668dde1b7cd3e0f949b24c9
node qa/candidate-rc36-delivery/delivery.cjs deploy --execute
node qa/candidate-rc36-delivery/delivery.cjs readback --execute
node qa/candidate-rc36-delivery/audit.cjs --execute
node qa/candidate-rc36-delivery/delivery.cjs finalize
```

`materialize` creates only `releases/candidates/Drive-Original-1.22.0-rc.36-d3f78f3/`; the package driver creates the sibling public-only ZIP. The exact committed manifest supplies 64 files, plus `.nojekyll` (65); the SW supplies 50 distinct shell entries and a separate root alias. No private build records or QA paths enter the site/ZIP. Clean exact HEAD, product/public/worker inputs, link checks, candidate worker name/origin, and runtime/write flags are required at every boundary.

The audit prepares memory floors, installed Chrome and Playwright, producer/input hashes, deadlines, result/failure records and cleanup before any remote request. `--prepare` performs local checks only; `--execute` rechecks preparation and uses a new anonymous headless Chrome process/context. All public bytes must equal committed Git bytes; shell caches/root alias, nine uncached source downloads, six private 404 routes and cold/offline rc36 shells are checked. The corrected rc35 stream helper is copied byte-for-byte: total budgets are 120 seconds, or 240 seconds for large archives; each read has a 15 second no-progress deadline and bounded cancellation. This avoids the historical 30 second archive assumption.

`audit-progress.json` and stdout carry progress every ten seconds; `results.json` is initialized before remote work and retains partial failure evidence. Deployment/readback attempt markers are durable before CLI execution, and failures/retained attempts block automatic identical retries. Inspect ambiguous external state and preserve the failed receipt before authorizing any separately designed recovery. Raw CLI/readback files are private local evidence; the shareable readback omits account/namespace/client identifiers and secret values. No hosted log contents are read.

`finalize` binds deployment UUID, exact product/public/site/ZIP/producer bytes, current wrapper/native-color hashes, fresh build records and corresponding runtime/notices/source archives. It writes only `source-readiness.json` as same-candidate technical delivery evidence. The canonical fresh audio build record remains `distributionReady:false`; no historical claim is rewritten. This receipt establishes no full-format, global color/pixel, HDR, real account/device, production or patent acceptance. Retained strict RGBA failures and the original unfinished goal stay owned by their existing evidence.

Final delivery receipts qualify all 65 public files, 50 distinct cached shell files plus the root alias, nine uncached source archives, six private 404 routes and cold/offline shell cleanup. `package.json` pins the 56,805,658-byte, 65-entry ZIP at SHA256 `0ddf6bad60324ad9d881362aebaf0adcbf9cca764e0ad68d487fafd0ce7fcc08`; the ZIP is outside this evidence savepoint. `redacted-readback.json` is the shareable control-plane receipt. Raw deployment/readback logs and private JSON are excluded.

Current PC36 source/cache and normal account readiness are recorded in `pc-current-source-cache-result.json` and `pc-current-cleanup.json`; the cropped `pc-rc36-applied.png` shows only the version panel. Current Android36 qualification is recorded in `android-current-transport-retry-attempt2-result.json` and its adjudication: six public source hashes, all 50 cache entries/root alias, activated current controller and no installing/waiting worker. One app-owned credential retry returned HTTP 200 in 605 ms, then normal initialization restored the visible library and ready/idle account. Existing tabs were preserved; all owned observers, MCP/CDP and ADB forward were cleaned. Neither current-device receipt observes a 35→36 transition or proves executing SW script bytes. No media playback, new grant, original media write or production deployment is claimed by this unit.

The Android source probe uses canonical `/` for the expected index bytes because `/index.html` redirects 307 to `/`; other source files retain `redirect:error`. The earlier successful version GET is reused only from its pinned receipt. The nonissuing credential GET403 is the expected CSRF guard, not a session denial; its canceled-body event is intentional. Historical authentication attempts without a Response remain causally UNKNOWN. The old Android update admission failure, unavailable-account observation, uninvoked-probe failure, canonical-route failure and variable-shadowing failure are retained without promotion. The final additive driver was checked with one full mocked lifecycle before its one actual app-owned retry.

All five `audit-attempt*` folders retain their original partial results, failure records and producers where present (memory floor, archive deadline, HEAD length, weak text ETag and private-response abort). Finalize VM cross-realm failures, original guard copies and array/manifest normalization receipts also remain intact. These are QA recovery history; final technical delivery does not erase them or expand the existing color/media acceptance. `savepoint-manifest.json` lists exact safe paths, sizes and hashes, excludes itself from its counts and explicitly excludes the private raw files. No passing product/live checks were repeated for curation.
