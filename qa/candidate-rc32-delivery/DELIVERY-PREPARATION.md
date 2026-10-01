# Candidate rc32 delivery preparation

Status: unbound local preparation. No source SHA is selected; no delivery scripts or binding record exist. No deployment, provider/browser operation, audit, readiness result, or product acceptance is claimed.

The binder is derived from immutable rc31 binder commit ae21f8ac6b34497b3690aef9bc67ecee86a7e927, SHA-256 ac27ffb99ebd83533f1cadac6da927832aa67176fcfe804d1c235302c2be759e. Changes are candidate31/candidate-rc31/rc.31 identity literals to rc32 and the predecessor commit/path/hash check. The same eight rc29 templates remain pinned at commit 5f6dae39a6a601207ff2c9e462b3ec8d610e91b4; their hashes are listed in local-delivery-preparation.json.

Binding requires the exact current committed HEAD as a lowercase full 40-character SHA and version 1.22.0-rc.32. Aliases, short SHAs, old versions, and noncurrent SHAs fail before script creation or mutation. There is no HEAD fallback. The pinned guard still checks source/runtime/Worker identity, private-input and path boundaries, no-overwrite behavior, metrics, and the 52-public/40-cache contracts. The actual committed audit producer is checked separately; no old outcome evidence is copied.

After the coordinator commits and verifies rc32 source, run from C:\extensions\Drive-Original\source:

`node qa/candidate-rc32-delivery/bind-source.cjs --bind <EXACT_CURRENT_COMMITTED_FULL_40_SHA> 1.22.0-rc.32`

This command is intentionally a placeholder and was not run for valid binding. Binding.json and the eight derived scripts must be generated only from that later committed source. Subsequent candidate-only delivery/readback/audit/readiness operations remain the coordinator's authorized work. Production/main/push, original-media writes, new grants, and automation changes are outside this preparation.

Checked locally: Node syntax, all eight immutable template hashes, and seven VM-isolated denial cases. Mocks permit only the two exact Git identity reads for the noncurrent-SHA case; filesystem calls are forbidden. These checks establish preparation and rejection behavior, not actual bound guard execution or deployment.

Curated preparation freeze: bind-source.cjs, DELIVERY-PREPARATION.md, local-delivery-preparation.json. SHA256SUMS.json records their bytes/hashes and excludes itself.
