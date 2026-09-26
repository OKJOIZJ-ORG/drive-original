# Q1 bounded503 recovery — local rc.7 — 2026-09-27

Observed baseline: actual app/SW first decoded frame, then a single finite Range503 causes Q1_SOURCE_HEADERS and terminal cleanup. `node qa/q1-resilience-audit.cjs --baseline` serves only public bytes from22f7271 without changing the checkout. qa/q1-resilience/before.json pins that product and the current driver.

Fix: only internally observed Range503 receives fixed Q1_SOURCE_HTTP_UNAVAILABLE plus frozen recovery advice. Missing Retry-After defaults250ms; canonical integer/HTTP-date<=2s is bounded250–2000ms; invalid/long values decline recovery. Source never retries itself. Player retains checksum learned on failed preflight, awaits settled old-source cleanup, waits cancellably, opens a freshly fenced source and reads the exact interval once. A player-lifetime budget survives seek generations. No partial/failed bytes enter parser/worker. Non503, permission/drift/malformed/body errors and uncertain cleanup stay terminal; no Q0/wholebody/iframe fallback added.

HTTP interpretation follows RFC9110 sections15.6.4 and10.2.3: https://www.rfc-editor.org/rfc/rfc9110.html#name-503-service-unavailable. The2s/one-attempt limits are product policy, not a standard requirement. Unsupported date syntax conservatively disables retry. A CORS-hidden header is unobservable and uses the absent-header policy; no claim of seeing an unexposed server delay.

## Local checks

- Source31/31, full Node339/339. Malformed statuses, forged callback/metadata recovery, Retry-After boundary/redaction, canceled/never-settling error body and late checksum controls.
- qa/q1-resilience/results.json:12actual app/SW synthetic modes. No-fault vs one503 both reach EOF; all24worker input records and6output fragments match exact sequence/offset/length/SHA256. Repeated503, revision/checksum/permission change, long wait, malformed206, close/seek/account replacement and budget retained after seek all discriminate safe behavior.
- qa/q1-lifecycle/results.json:9Chrome component modes; two new503cancel failures block any replacement including seek, without appending. Failed cancellation is not called success because counters are zero.
- qa/q1-product/results.json:16normal app/SW modes still pass with final rc.7 producers. Build/static/diff checks pass. No encoding/bootstrap/mux algorithm change; existing native/preservation results remain fixed-producer evidence, not newly executed assertions.
- Independent source/main review clean after replacing a weak cumulative-counter assertion with complete worker byte-record comparison. Reports bind current source hashes and baseline Git bytes separately.

## Open gates and rollback

This independently reproduced503 is NOT an explanation/fix claim for the historic299s Q1_SOURCE_READ_FAILED. Generic fetch/body/metadata failures still fail closed. Actual expiry/sleep/wake,50cycle resource behavior, authenticated current priority/version, iPhone/PWA, audible/color output,total memory and full formats remain open. Current candidate is still rc.6; no original/private read, remote write or deployment in this unit. Revert this coherent unit via a new work-branch commit if needed; do not reset prior work or alter auth/appData/production.
