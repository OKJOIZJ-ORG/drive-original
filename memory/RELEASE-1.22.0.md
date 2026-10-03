# Drive Original 1.22.0 — approved release queue complete — 2026-10-03

Observed: D075's remaining main integration, remote push, production deployment, legacy entrypoint and distribution are complete. This closes the approved finite queue; conditional quality/device limits below remain explicit. [Original ten-item reconciliation](CANDIDATE-RC38-20261003.md) preserves the implementation and BUG01–08 evidence without relabelling old results.

## Published identity

| Surface | Verified identity |
|---|---|
| Operating app | https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/ — version1.22.0 |
| Published runtime/source | 54e786f499c4496259bdb6e066e9626381cbe376; main fast-forwarded and pushed |
| Worker deployment | e70754c7-d201-47ba-b7c4-43a0dd673732 |
| Legacy GitHub Pages | https://okjoizj-org.github.io/drive-original/ — handoff20d864c1d9ceea3d5a24c9cca97b6de57216cb68 |
| Pages build/action | built at20d864c; Actions37102639695 completed successfully |
| Public distribution | workspace releases/Drive-Original-v1.22.0-54e786f.zip;65entries/56,806,974B |
| ZIP SHA256 | df7d7ef513e80d3ac2a350e76c82e810bfd1dc8b36a9f3bd5020280af925d095 |

The existing free Worker origin, Google client, secrets and Durable Object account/session ownership are preserved. Runtime candidate=false; ordinary Drive mutations and account-state writes are enabled through the unchanged canonical grant/capability/account/version/lock/readback controller. Authentication stays enabled; optional diagnostics and observability are off. The hostname is retained for session continuity. No original media mutation, new grant, paid service or automation restart occurred during promotion.

Only five public version/mode shell assets changed from reviewed rc38 sourcea9b2609. Every media/decoder/corresponding-source byte is unchanged; proof savepointcc59733 is retained. Later QA/document commits are savepoints, not new runtime deployments.

## Verification and distribution

- Local integration:843/843 Node checks pass, syntax and diff checks pass. Production-mode cases distinguish verified writes, readonly-grant denial and absent/candidate flag denial. The nested publisher preserves licenses/index.html separately from the root shell. Earlier stale-contract failures remain in exact compressed logs; no product failure was relabelled passed.
- Production:65public assets qualified against source54e786f;56fresh GET comparisons and9unchanged source archives reused complete Git/hash proof plus fresh identity-encoded strong content-address ETags. Fresh cache51 entries are Git-equal, source archives stay uncached, cold/offline version1.22.0 is controlled, page errors0, private6routes404. Anonymous cookie-free session POST returns401/no-store without backend account mutation. Fresh deployment readback preserves all11bindings and the existing namespace/secrets/client. [Serving receipt](../qa/release-1.22.0/served.json), [readback](../qa/release-1.22.0/readback.json).
- Legacy entrypoint:11public files match Pages commit20d864c, private3routes404, actual managed anonymous Chrome navigation reaches the operating1.22.0 app. The old full-repository workflow remains disabled. [Live proof](../qa/release-1.22.0/legacy-serving.json), [navigation](../qa/release-1.22.0/legacy-navigation.json).
- Transition preservation:6.385s isolated localhost trial using the actual1.21SW and mocked destination passes all6transition/storage/offline clauses. Open windows are not forced away; localStorage, IndexedDB and old/unrelated caches remain. [Local receipt](../qa/release-1.22.0/legacy-browser-result.json). This is not a physical installed-app or complete unsynced cross-origin migration proof.
- Existing normal Chrome shows v1.22.0 and the library in a fresh agent-created tab, then that tab was closed. This DOM observation is separate from rigorous account/device/playback proof. Current finite rc38 actual PC and physical Android playback, and prior normal-app remote writes, remain valid within their original scope and were reused. No new browser approval was requested.
- ZIP:all65entries independently read back and equal immutable public Git blobs, with0private extras. [Package receipt](../qa/release-1.22.0/package.json). The public package requires the operating same-origin authentication backend; it is not a standalone backend export.

## Failures, cleanup and remaining limits

Preparation scanned7,215new-history objects/5,289text blobs with0matched credential literals or >=100MiB objects. Initial sk-pattern risk-label false positives and raw-CRLF-vs-Git-LF refusal remain; corrected producers use anchored patterns and canonical Git bytes. This is a bounded credential-pattern scan, not exhaustive privacy classification.

Chrome MCP output-file roots were stale after relocation; inline observed output was saved through normal workspace tools. CUA's DOM-only navigator refusal and optional screenshot timeout are retained separately. No screenshot was produced, no product redeployment or repeated successful check resulted from these tool defects. The navigation output was transcribed from its already observed inline result after a terminated exec discarded pending store state. [Tool record](../qa/release-1.22.0/browser-tool-refusals.json).

All timed verification requests, isolated contexts, sockets and owned processes closed successfully. All earlier generated fixtures remain recoverably trashed with qualified readback; no original or unknown write was replayed. The normal release inspection tab is closed; user tabs were untouched. QA/private raw CLI/control records remain ignored. Automation remains PAUSED.

D066 defers physical iPhone Chrome/Safari/standalone/VoiceOver to post-deployment follow-up. Strict RGBA diagnosticFAIL and source-intended color/GPU/AndroidYUV/HDR/high-depth/physical audibility/executing-worker-byte and real-provider populationp95 UNKNOWNs remain in the candidate result owner. Original69bounded statuses are not69PASS; inventory/probes are not whole-video playback. No universal format, fidelity or reliability claim is made. The legacy installed app may need opening/installing the operating origin; old origin data/permissions are preserved, not claimed copied.

[Final bound adjudication](../qa/release-1.22.0/final-adjudication.json) owns release receipt hashes and completion boundaries. iOS is a deferred follow-up, not an unfinished approved pre-release gate.
