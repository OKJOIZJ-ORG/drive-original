# rc.16 hosted security — bounded read-only evidence

Candidate public version **1.22.0-rc.16** remained byte-identical before/after the
anonymous probe. **12/12 negative cases passed**. This leaf adds current live
negative-request evidence for QA-SL-03 and configuration/policy evidence for
QA-SE-02; neither whole acceptance row is promoted.

## Identity and authority

The retained deployment is source `e57d7b5b3154a2a838d01f631cf71fa063044280`,
Worker `cbbafb96-b39b-4cf7-bbf8-888ed3856370`. Its private version readback was
checked in memory against the existing public integrity hash. No private value,
customer identifier, credential or raw response is copied into this leaf.

Relevant current worker/auth source matches that fixed Git source after CRLF
normalization; exact current worker/test bytes match the already-passing rc.16
558/558-suite record. The existing suite is reused, not rerun. Unrelated ongoing
rc.17 product edits are outside this unit. Public `/version.json` cannot establish
the currently active backend Worker UUID: **fresh active-version/settings reads
were not performed**, and this is retained-source plus live-boundary evidence.

The producer sends no Cookie or Authorization headers, uses no browser profile,
and follows no redirects. Only `/version.json` GET and anonymous
`/api/session/credential` GET/POST are admitted. No logout/disconnect/transaction,
OAuth start/callback, original/media, settings, grants or production route is
called. Valid anonymous credential requests fail before session lookup/owner
operations; the inspected route shows no state write is reached.

## Live negative results

| Discriminator | Observed |
|---|---|
| Correct request envelope, no session cookie | 401 `unauthorized` |
| Missing whole browser envelope; absent/wrong Origin; absent/wrong CSRF; cross-site; wrong fetch mode/destination | 403 `forbidden` |
| Correct envelope, wrong method; malformed JSON; unexpected field | 400 `bad_request` |

Every response has only `{error:{code,retryable:false}}`, JSON content type,
`Cache-Control:no-store`, `Pragma:no-cache`, and `nosniff`; none sets a cookie,
redirect or Access-Control-Allow-Origin. Raw bodies/errors are never persisted or
printed. Current contracts return **400**, not 405, for the wrong-method case;
the rejection is proven but a 405 contract is not invented.

There were **16 total candidate requests**, including three public-version GETs
and one invalid negative-mode attempt. Node fetch overwrote a requested
`Sec-Fetch-Mode:navigate` with `cors`, yielding the expected no-session 401.
The first seven valid cases were preserved; only the remaining five were
completed using standard HTTPS with exact supplied headers. A loopback-only
transport discriminator records this Node behavior independently. This transport
correction is not a server failure. Per request deadline10s/body4096bytes;
total response65536bytes/request16 cap. The executed producer refuses new starts
after120s per phase; its last request is bounded by10s. The retained successor
also caps that final request by the remaining120s window.

## Logging and retention: distinguish three evidence levels

**Configured source:** `worker/wrangler.jsonc:29` explicitly sets
`observability.enabled:false`. No sampling, log-persist, invocation or trace
override is configured there. The public `AUTH_DIAGNOSTICS` flag is true. Its sole
Worker logger at `worker/index.mjs:119` receives only fixed allowlisted stages
(`AUTH_DIAGNOSTIC_STAGES` / `diagnose`); reused tests at
`tests/cloudflare-auth-worker.test.mjs:157`, `:405` and `:418` cover provider-error
redaction. This proves current source intent and fixed diagnostic shape.

**Retained deployed metadata:** the private version readback includes
script/runtime/bindings but **no observability settings**. The public diagnostic
flag is confirmed true from that retained binding. Deployed collection, sampling,
invocation logs, persistence and tracing therefore remain **unknown**, not false
or zero. The record does not establish the customer's current plan, sessions,
tail consumers, external exports, actual dashboard retention or hosted log
contents. No privileged settings/log query was made.

**Documented platform policy (checked2026-09-30):** Workers Logs is included on
Free, with200,000events/day and3-day retention; Paid retention is7days. Logging
includes invocation/custom/error events, and invocation messages include method
and URL. Unspecified sampling is1 when enabled. These defaults describe the
platform, not this account's actual settings. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)

New Workers default to enabled observability; explicit configuration is the
configuration owner. [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/#observability)
In the OpenTelemetry export configuration, persist defaults true; setting false
stops dashboard persistence while export may continue. Free export is listed as
unavailable. This separate mechanism cannot be conflated with Workers Logs Free
retention. [OpenTelemetry export](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/)

## Remaining gates

- **SE02:** actual active candidate logging/trace/export settings and applicable
  plan/retention still need a narrowly authorized readback. Historical/all-process
  secret absence cannot be inferred from disabled current configuration, default
  retention, repaired canaries, or these anonymous errors. Existing public/cache
  distribution proof is reused and was not repeated.
- **SL03:** anonymous session/Origin/CSRF/fetch-context/input boundaries and
  error/no-store behavior are now live-proven. Wrong-account/revision/protocol,
  expired/revoked authenticated sessions and server credential lifetime require
  real session/provider authority or disposable fixtures; no privileged live
  credential request was made. Hosted retention remains the shared open gate.

## Exact artifacts and review

`probe-executed.mjs` preserves the exact executed producer and its hash is bound
in `live-results.json`; `probe.mjs` adds the tighter whole-phase final-request
deadline. It was syntax-checked, not replayed against the candidate.
`settings.json` and
`live-results.json` are safe fixed-run outputs. `verify.mjs` performs only local
artifact/source checks and the loopback transport discriminator. Run it with
`node qa/rc16-hosted-security/verify.mjs`; this does not repeat hosted probes.
Do not replay `probe.mjs` after candidate identity changes.

Stage only the exact new files in `curated-savepoint.json`. Private deployment
readback, credentials, raw bodies, originals and product files are excluded.
Root owns integration and the savepoint. No product setting was changed.
