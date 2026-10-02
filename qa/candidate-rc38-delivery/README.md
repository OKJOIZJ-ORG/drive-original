# rc38 candidate delivery tools

Preparation only. Runtime source is UNKNOWN; no source-binding.json exists. Root must commit the reviewed runtime/version38 first and keep HEAD exactly at that commit with clean public/worker inputs through delivery and device qualification. The binding command refuses a noncommit, wrong committed version, preparation hash mismatch or changed tool producer; it writes once.

Root sequence after authorization:

1. `node qa/candidate-rc38-delivery/source-binding.cjs --bind <exact-runtime-40hex> --root-authorized`
2. Existing candidate sequence: delivery.cjs materialize; build-release.py <exact-runtime-40hex>; delivery.cjs deploy --execute; readback --execute; audit.cjs --prepare; audit.cjs --execute; delivery.cjs finalize.
3. pc-prepare.cjs emits current38 source/cache proof and trusted37→38 update baseline. After readiness, android-current-prepare.cjs emits the physical update/source binding; android-current-driver.cjs --inspect-once performs the maintained normal update qualification.

All real actions reject unbound source before environment/device handling. Template baseline files are preparation sources, not operational expressions. Generated PC expressions and Android bindings are emitted only after source binding; Android additionally requires finalized delivery. New actions retain once-only failed receipts. A partial generation must be inspected rather than retried by deleting receipts.

Tools adapt candidate-rc37-delivery's reviewed guard/delivery/package, corrected audit prefix and exact-Git/content-address/strong-ETag archive reuse, verified download and normal PC/physical helpers. Current65 public,50 cache plus root alias51,9 archives,11 bindings,6 private404, cold/offline and cleanup checks remain. Prior archive evidence is reused only for unchanged exact bytes with current deployment and fresh strong ETag; missing reuse qualification fails rather than silently repeating archive bodies. Old public-prefix receipts cannot cross source/version bindings.

Bound audit preparation records an exact9-archive comparison of prior/current committed bytes, prior receipt bindings, byte counts and SHA256. Only the finite changed subset requires bounded full current-Git download (600s total/15s no-progress/5s reader cleanup per archive); unchanged archives retain current content-address/fresh strong ETag reuse. An added archive or stale prior/current binding fails. The changed list is derived from exact committed bytes, not an assumption that all archives changed or all remained identical. archive-plan.test.cjs is mock-only evidence for changed/unchanged classification and exact full-download cleanup.

Local preparation/import/syntax and focused unbound/binding mocks are not delivery or device proof. No production, login/grants, provider or media operations are performed here.
