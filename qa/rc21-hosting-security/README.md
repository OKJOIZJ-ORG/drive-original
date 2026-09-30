# rc.21 authenticated hosting reads and synthetic owner boundaries

Current authenticated Cloudflare analytics are now observed. The selected billing
plan and effective observability flags remain unverified for a precise reason:
the existing credential gets HTTP403/code10000 from both account subscriptions
and billable-usage info, while the supported settings reads return
`observability:null` or omit it. No new login, grant, dashboard session, setting,
deployment, payment or product change was made.

## Fixed identity and actual reads

Public source `3ebd97df80144fb8ebbaf1f945394a796d4425b8`, rc.21 Worker
`b1021a42-fb32-47d5-92be-7fd92736faf7`. The control-plane producer recorded its
current HEAD and config hash, read active deployment before/after, and confirmed
the same fixed Worker at100% and unchanged deployment/source/config. The later
aggregate queries describe the same account's current UTC day, not exclusively
rc.21 traffic: older candidate versions can contribute to today's metrics.

13 official API requests total:8 initial deployment/settings/account/analytics
reads,2 schema/billing reads,2 metric-field/SQLite reads and1 missing row/namespace
usage query. POST requests are GraphQL queries only. No log/tail query, candidate
app/credential/media request, normal browser access, broad test rerun or prior
anonymous probe repeat occurred. The existing Wrangler auth was captured in
process memory; disk logging/metrics were disabled. The initial credential store
changed during supported token retrieval; this is consistent with Wrangler's
existing OAuth-token refresh path, not a new login or grant. The collector records
`credentialStoreUnchanged:false` and does not save the prior credential bytes.
Exact credential-field differences cannot therefore be independently reconstructed.
Later producers use the same supported token command; they do not independently
hash-check the credential store. No unchanged-store claim is made.

| Actual observation | Evidence |
|---|---|
| Script observability | explicit null |
| Combined and fixed-version observability | field omitted |
| Logpush / attached Tail Worker consumers | false / absent |
| Worker and account usage model | standard; this does not identify Free versus Paid |
| Account subscriptions and billable-usage info |403 / API10000 |
| Account and candidate requests today through07:13Z |70; errors0; subrequests76 |
| Candidate CPU P50 / P99 |1.192ms /6.029ms |
| Durable Object requests / summed CPU |48 /93.146ms |
| SQLite rows read / written / exceeded CPU errors through07:17Z |116 /58 /0 |
| SQLite namespace storage |1 namespace;425,984bytes day maximum |

The live introspection schema explicitly describes CPU quantities as
microseconds. SQL storage uses `durableObjectsSqlStorageGroups`, not the older
key-value storage dataset whose empty result is retained in `control-plane.json`.
The storage number sums each namespace's maximum over the UTC day (1 group,
query cap100 not reached). It is not exact instantaneous stored bytes or a
billing ledger. Analytics are aggregate/sampled observations, not capacity proof.

## Documented Free limits and bounded behavior

Current official [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
list100,000requests/day,10ms CPU/invocation and128MB memory. CPU exhaustion
terminates with1102; daily request exhaustion returns1027. Those figures apply
only once this customer's Workers Free plan is independently established.
P99 below10ms does not prove every OAuth/auth request meets that cap.

[Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
lists SQLite Free limits:100,000requests/day,13,000GB-s/day duration,
5millionrows-read/day,100,000rows-written/day and5GB stored data. Further
operations fail when a Free limit is exceeded; daily limits reset at00:00UTC.
No real quota exhaustion, paid load test or cost-bearing deployment was attempted.

The local integrated route/AccountCredentialOwner synthetic producer passes13
discriminators: valid session; wrong account/protocol/future revision;
Origin/CSRF/cross-site guards; unknown session;30-day idle and90-day absolute
expiry; logged-out session; exhausted storage; unavailable provider. Negative
cases return the exact bounded JSON error with no-store/no-cache and no cookie
or CORS grant. Synthetic storage/provider failures return503 `auth_unavailable`;
the provider case made one refresh attempt, no revoke, and zero network calls.
Synthetic injected storage failure is not an actual Cloudflare quota crossing.

Real sessions cannot be created through a fixture/control-plane API: the Worker
accepts session establishment only after Google code exchange and verified OIDC.
This leaf does not use/revoke the human's session, create grants, alter their
clock or claim hosted authenticated expiry/account proof. An existing same-account
browser can separately perform non-destructive expectedAccount/protocol/CSRF
negatives through its actual session owner without exporting credentials.

## Logging and remaining decisive steps

[Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
lists Free retention3days and200,000events/day; enabled unspecific sampling defaults
to1. [OpenTelemetry export](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/)
is a separate collection/export mechanism. Neither establishes this account's
current collection, persistence, tracing, destinations or historical log contents.
Source `observability.enabled:false` remains intent. Null is not exported as
false, zero sampling or zero retention. No raw logs were read.

The narrow remaining read is the authenticated candidate dashboard's
observability settings plus Workers plan/usage/billing safety details, or an
official API read that explicitly exposes those values with the existing access.
The existing read credential's billing403 is exhausted across two supported
categories; no permission expansion was attempted. A dashboard login/2FA would
be a human boundary, not a missing general browser automation capability.

QA-SE-02 and QA-SL-03 retain effective logging and actual authenticated expiry
limits. QA-SL-04 now has actual calls/CPU/SQLite aggregate evidence and local
finite-failure evidence, but actual Free selection/no-card/automatic-upgrade
safety and runtime quota failure are not promoted. QA-SL-08 retains existing
anonymous/source distribution proof; no production change was made or newly
verified here. Entire acceptance rows remain partial.

## Artifacts and local verification

Four historical bounded read producers and their outputs bind exact producer
and private response SHA256s. Private account/namespace identifiers, responses
and CLI auth stay in ignored `private/` or memory. Safe exports contain only
aggregate numbers, nullable configuration values, fixed source/Worker identity,
API status/error codes, schema field descriptions and integrity hashes.

Run `node qa/rc21-hosting-security/verify.cjs` for local hash/shape/scope checks.
It neither reads auth nor repeats live requests. Stage only files listed in
`curated-savepoint.json`; root owns integration and commit.
