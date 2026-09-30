# Multi-client update and worker-owned shell refresh

Implementation: gpt-6.1-sol high. The coherent unit changes only `app.js`, `sw.js`, `tests/app.test.js`, `tests/sw.test.js` and the exact affected test in `tests/audit.test.js`. Root owns version metadata, whole-suite checks, commit, delivery and actual signed-in follow-up. No account/media mutation, personal browser, deployment, new permission or persistent recovery flag was used here.

## Reproduced mechanism

The immutable24→25 native baseline first qualifies two controlled anonymous local Chrome documents with all40 distinct cached file hashes. After the existing Settings/version-check flow has already activated25, one trusted normal update click deletes the complete cache and unregisters the exact app scope. The new25 document remains uncontrolled with no shell cache through the unchanged45s limit, while its sibling still holds the same registration/active-worker/controller objects. The new document sees an already activated worker without a new install/activate. `two-clients-baseline-v2-results.json` preserves this observed local registration reuse. The preceding `two-clients-baseline-results.json` is a separate QA failure: it incorrectly waited for the sibling banner whose check preceded the server switch. Both failed producers and raw records remain unchanged.

The exact existing force function was independently tested through its trusted Settings button in `two-clients-force-baseline-results.json`. It produces the same uncontrolled/empty-cache/activated-registration state at45s. This establishes the adjacent force defect rather than assuming that normal-update policy proves force behavior. The local failure does not identify the worker in the separate actual signed-in PC failure, whose old identity and late initialization remain unknown.

The immutable server and refs24 `8a2894ee2c7aa85c9cb2ff992879f4580e15e2e7` /25 `7ba8e654fa38def8c8e00efcbf1600a4c8730c53` remain fixed. The inherited one-client baseline passed289ms. [W3C Unregister and Try Clear Registration](https://www.w3.org/TR/service-workers/#unregister-algorithm) distinguish unregistering from a registration still used by clients; the concrete reuse claim above is local Chrome observation.

## Correction and ownership

Normal `applyAppUpdate` retains the registered worker and complete shell and performs its existing `_update` document replacement. The registered worker's existing network-first shell handling refreshes requested files. The normal-only native after controls passed one-client137ms and two-client2172ms with full40/current-controller checks. Their source hash is the earlier app `931fc98f57273336d943ec9ddbf7fb3c78c8c44d93e4dcc4e56d6ac152fdff00`, not the final larger force unit. `normal-unit-app-source.js` was reconstructed from the fixed baseline plus the unchanged normal function and matched that complete hash exactly. Historical README/manifest and first before/after test logs remain in `normal-unit-*` and `focused-*` files. They describe the earlier unit; their old force policy is superseded here.

The button remains `강제 캐시 새로고침`. Its action now requests fresh shell files from the exact active app worker; it never deletes caches or unregisters. The unused destructive `clearAppShellStorage` helper is removed. The worker reuses its authoritative41 `SHELL_FILES` keys, including root/index aliases, to fetch original public URLs with `cache:no-store` as a single `Cache.addAll` batch. No second asset list, source archive, media URL, credential or appData operation is introduced. [W3C Cache.addAll and Batch Cache Operations](https://www.w3.org/TR/service-workers/#cache-addAll) define the batch operation.

The protocol has fixed request/reply types, a versioned protocol string and bounded request id. The worker resolves the actual WindowClient and permits only its same-origin exact root or root `index.html` path. It checks its own active-worker identity, limits admitted waiters to8 and coalesces them into one batch. Client lookup has2s and the batch has15s deadline/abort. A still-unsettled batch prevents another overlapping job even after timeout. Existing credential/Q0/Q1 maps and activation policy are unchanged.

The page has one20s deadline over registration lookup plus ACK. It checks the exact root registration and original `sw.js` URL, allows an active exact registration when the document has no controller, and requires a matching positive versioned ACK. Account, drive generation, media/playback/source/seek/route generation, selection, immutable pin, Q0/Q1 owner and controller/active-worker identities must still match. It coalesces clicks, closes both ports on completion, and ignores stale/late completion. Only success reloads the document. Failure, unsupported old worker and timeout show an explicit error and retain the document, registration and caches. No local retirement barrier is reset or waived; new-document state comes from document replacement.

Timeout means no destructive reset and no page reload. Chrome154 abort during a pending HTTP response rejects `Cache.addAll` and preserves old bytes (`cache-addall-abort-native-results.json`). A deadline can race a final complete atomic cache commit after fetch has completed; that complete late fresh batch is allowed. The independent spec-conforming post-fetch discriminator is retained in `../rc26-shell-refresh-review/deadline-counterexample-results.json`. No partial batch or byte-identity promise for every timeout is asserted.

## Final frozen evidence

| File | SHA-256 |
| --- | --- |
| app.js | b30abd16b181ff6f7f410094cf4048d7dae14504ad5a8d65ad604656fd3dea75 |
| sw.js | 511bfdf4365b9a3f8e75e61c2dc9512c09c4ea68bd3be63f80cb0b1076d2d6eb |
| tests/app.test.js | 4eb72eb28eaa969eb1c311a87a3ee43687af8cfab9914535f3eb8c78b8debec1 |
| tests/sw.test.js | 29aac1ae19c742a9bb409d7f6e3660b6299a9fc193e82e46b565b8db28f31026 |
| tests/audit.test.js | b8a542d01751cdd1568e89986ade89acd057719af12a8fcd4e5570fa25b7158f |

`force-focused-final.txt` retains14/14 passing maintained tests (PowerShell UTF-16LE raw output). They exercise real app/worker functions, positive/mismatched/negative ACK, account/source/seek/controller invalidation, active fallback, coalescing, deadline/late ACK/port cleanup, full authoritative batch, foreign/sibling-prefix/non-window/inactive rejection, failed batch/retry, abort and unsettled-job exclusion, plus existing update supersession/deadline handling. `node --check app.js`, `node --check sw.js` and the scoped `git diff --check` pass. Root performs the whole suite. The independent9-request/current-worker-replacement adversary verifies one41-key batch,8 negative owner-changed replies, all ports closed and7 credential/media maps unchanged; its evidence is separately owned by `rc26-shell-refresh-review`.

The final native producer overlays only current app/SW (versions normalized24/25) into the two immutable historical public bundles; other50 public paths retain their exact historical bytes. All7 records bind the same final app/SW hashes before/after and exact executed producer/server SHA. Every positive path requires activated current controller and all40 distinct file hashes. Native Chrome154.0.8037.58, anonymous local context, unchanged memory floors (physical>1048576KiB, virtual>1572864KiB) immediately before each launch,45s readiness guard, owned browser/context/server closed:

| Final record | Discriminator | Result |
| --- | --- | --- |
| force-two-results.json | trusted force with two controlled clients | full40/controller,2173ms; sibling same worker/registration/active |
| force-one-results.json | trusted force with one controlled client | full40/controller,232ms |
| force-partial-results.json | known shell deliberately reduced to6 keys | full40 repaired,2156ms; sibling owner unchanged |
| force-uncontrolled-results.json | no controller, live exact active registration after reproduced reuse | full40 plus controlled new document,2293ms; sibling owner unchanged |
| force-network-results.json | one fresh known asset responds503 | visible error/no new document; old40 hashes and sibling owner retained |
| force-unsupported-results.json | original old worker lacks protocol | bounded visible error/no new document; old40 and sibling retained |
| force-timeout-results.json | held known response and two trusted clicks | one coalesced batch; bounded error/no new document; old40 and sibling retained |

This is local Windows Chrome mechanism proof. It does not qualify the actual signed-in PC update/recovery, Android, private corpus, physical playback, or production release. Root's later version-only integration must retain separate identities and actual acceptance evidence. No native claim is made for a later app version hash.

`checks.json` records exact frozen products and raw/native outcomes. `manifest.json` is an explicit safe-path/hash allowlist; mutable last-run server state and implementation-authoring scripts are excluded. The preserved original failed records are never relabeled as passes.
