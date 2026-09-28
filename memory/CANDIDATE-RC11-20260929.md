# Candidate rc.11 — 2026-09-29 KST

Source b9d873926e894bb89a9faa8e638f7f0a80c0eb7e; app/SW1.22.0-rc.11;
Worker fe556d43-9251-40c7-82bf-d138f35ebccd. URL:
https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/.
Candidate-only free delivery; general Drive writes=false, own account-state
writes=true. No merge/push/production replacement, new grant, billing or volume work.

The separate state gate permits the ready account's canonical own appData writes,
durable preallocated-ID CREATE and independent full readback; malformed/missing
inputs fail closed. STATE-NORMAL-20260928.md owns implementation and real evidence.
Full product368/368, related157/157 and scoped independent review passed before
delivery. Public19files/cache17 byte-match source; cold/offline/private404 pass in
qa/candidate-rc11-delivery/results.json. This public test is anonymous desktop.

Actual Chrome normal state sync and app reload9liked/48unliked/140viewed pass.
Independent full readback proves own writer expected body and all6older documents
unchanged. Five protected recovery JSON files remain ignored/tracked0; root-owned
private directory retains actual screenshot/deploy log. Exact-app empty-cache
read-only reconstruction and old-production-code/local-provider compatibility
pass. Their scope is recorded separately; no physical/mobile acceptance inferred.

Rollback: retain v1.21.0/e08989a unchanged in production and rc.10/8187121 as the
prior candidate. A candidate rollback is a new normal deployment of a known tree,
never a force reset; account schema remains1 and per-writer/legacy reads preserved.
Do not automatically undo Drive state or delete legacy writers. Production
deployment and actual multi-device/OS gates remain open under D-050/D-057/D-059.
New UI requests remain queued while existing core work continues.
