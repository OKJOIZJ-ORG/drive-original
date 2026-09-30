# rc.18 deployed logging settings — read-only control-plane boundary

**Actual candidate settings were read successfully. Observability's individual
booleans/rates remain unresolved because the supported readbacks return an
explicit null or omit the setting.** This is a response/semantics boundary, not
missing credentials, an unattempted tool, or a inferred installed default.

Fixed source `f6749c1a1b1a8345f8f76606786e0c1ccb48b21c`, runtime1.22.0-rc.18,
Worker `7eb9f9d7-c072-4095-bc94-d6776c69ad4b`. Two active-deployment reads matched
that Worker at100% traffic and the same private deployment identity. HEAD/config
were stable before/after. No candidate/public/anonymous probes were repeated.

## Actual safe observations

| Read-only endpoint category | Actual observation |
|---|---|
| Active candidate deployment, before and after | Expected rc.18 Worker at100%; identical deployment |
| Candidate script-only settings | `observability` field explicitly null; `logpush:false` |
| Candidate script and active-version settings | No observability field |
| Candidate default-environment metadata used by canonical Wrangler download | No observability field; no attached Tail Worker consumers |

The API's optional/null observability response does **not** document null as an
enabled=false value. Collection, top-level/log/trace sampling, persistence,
invocation logging, export destinations, issues and query redaction therefore
stay null/UNKNOWN in the safe record. Current Logpush=false and
tailConsumersPresent=false are explicit actual observations. Source
`observability.enabled:false` remains configuration intent; it is not substituted
for the missing live enabled boolean.

Five candidate-scoped GETs were made; no account-wide worker list, log query,
tail preparation, settings PATCH, deployment, grants or app/media request was
made. The API environment name `production` here is the candidate Worker's
default environment used by Wrangler; it does not target the separate production
Drive Original Worker.

## Credential and artifact handling

Installed Wrangler4.135.0 provides supported `auth token --json`. Its output was
captured only in producer process memory, parsed there, never exposed or saved.
The existing stored OAuth credential was independently unexpired, and its file
remained unchanged. No refresh/login/grant flow was needed. Wrangler disk logging
and metrics were disabled for both retrievals; the installed source's
`shouldLogToDisk` guard was checked before invocation. No token was passed in
process arguments or source. No dependency or global configuration was changed.

Endpoint paths/account/namespace/client/customer identifiers and raw API responses
remain under ignored `private/`; only booleans, nullable numeric sampling values,
endpoint categories, public source/version fences and integrity hashes export.
`results.json` binds exact initial/final producer hashes and raw response hashes.
Its `responseBytes` is the final phase's bytes; sum endpoint byte fields for the
whole five-read unit. `local-verification.json` records that total.

The first producer completed three GETs and stopped on missing observability.
The prepared second producer retained those observations, read only the canonical
candidate environment discriminator and final deployment fence, and recorded
`observabilityResolved:false`. It did not replay successful settings reads.
The canonical environment's script identity matched the exact candidate name.

## Primary capabilities and limits

Official [Wrangler general commands](https://developers.cloudflare.com/workers/wrangler/commands/general/)
describe the existing-token retrieval command. Installed `wrangler-dist/cli.js`
lines346225–346280 implement it; lines63349–63355 implement disk-log suppression.

Official [Get Worker Script Settings](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/settings/methods/get/)
documents the script-settings GET and optional observability object. Official
[Get Worker Script and Version Settings](https://developers.cloudflare.com/api/go/resources/workers/subresources/scripts/subresources/script_and_version_settings/methods/get/)
documents the combined settings GET. Both accepted the existing credential.
Official [List Worker Deployments](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/list/)
defines the first deployment as actively serving traffic; first-page/one-item
requests provided both identity fences. The exact candidate environment GET and
observability extraction are implemented by installed Wrangler
`fetchWorkerConfig`/`downloadWorkerConfig` at lines169373–169442. Installed package
version and complete CLI bytes are hash-bound in the result.

Search results supplied the current primary API schemas; direct page-open access
for the settings API docs returned a web-tool restricted-URL error. This browser
fetch limitation did not prevent the authenticated official API GETs themselves.
No source interprets returned null as a guaranteed false boolean, so no such
claim is made.

## Acceptance scope and smallest remaining gate

**QA-SE-02:** current Logpush and attached Tail Worker absence plus fixed live
deployment identity are now proven. The supported settings visibility boundary
is precise. Actual log collection/persistence flags, effective retention,
historical log contents and all-process secret absence are not proven. No log
contents or customer plan were read; rc.16's documented platform retention policy
remains historical and is not account-specific evidence.

**QA-SL-03:** this adds current hosted configuration evidence; it does not repeat
or refresh rc.16's anonymous401/403/400 results or prove any authenticated
account/revision/expiry boundary. The whole row remains partially covered.

A decisive next read is the exact candidate's authenticated dashboard settings
view exposing the Workers Logs/trace/export toggles, or a supported control-plane
readback that explicitly exposes those values. That would establish current
configuration only; it would still not prove historical secret absence or actual
retention contents. Changing settings to force a readable value is outside this
read-only unit and was not attempted.

## Local verification and exact curation

`node qa/rc18-hosted-settings/verify.cjs` checks safe result types, both active
identity fences, producer/private readback hashes, credential-safe exports and
unchanged source fences without network or credential retrieval.

Stage only the nine exact files in `curated-savepoint.json`. `private/` and all
credential/raw/customer data are excluded. Producers are historical bounded
two-phase evidence, not commands to replay after identity changes. Root owns
integration and the commit; no product/version/global/history file was edited.
