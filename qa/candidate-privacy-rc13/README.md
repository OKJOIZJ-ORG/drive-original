# Candidate rc.13 privacy and security qualification

Fixed public source: `570f9c38506d1e426c33cf65b73836d32bf872c0`. This bounded unit audits app/SW/auth logging and credential/deployment owners; it does not repeat the prior 19-asset delivery, 17-cache or private-route qualification. No real account, login/grant, mutation/logout/disconnect endpoint, credential store, private profile, settings, historical logs, production or deployment was modified.

## Supported finding and next-unit repair

The fixed app's `driveFetch` turns upstream `error.message` into an Error. The actual `loadFiles` catch then sends that raw Error to `console.error`. In an anonymous local DOM running the fixed Git public files, a realistic synthetic 404 `File not found: QA_PRIVATE_ID_CANARY.` reached the browser console, while the UI's existing 404 explanation omitted it. This is demonstrated local-console data exposure through a real caller; no real private ID or actual credential was used or claimed to have leaked.

The next-unit repair in `app.js` consolidates 23 raw error/warning call sites through `reportAppFailure`: fixed caller stage, classified category, integer HTTP status, and a short allowlist of fixed codes. It never passes an Error, message, stack, provider payload, URL, file/account ID or token to console. Existing UI explanations remain. Auth Worker/SW were not edited because this unit found no demonstrated corresponding defect there. Raw historical console/hosted records were not rewritten.

Root's integrated14-file product suite passes387/387 and independent Astra medium read-only review finds no material console-owner issue. The two already-executed Q0 diagnostic expressions keep their literal CRLF bytes/hashes through exact-path Git attributes; a trailing blank line in the local v2 test file was removed. Initial whitespace-check output is retained separately from the final check; no actual diagnostic expression was normalized or replayed.

Evidence:

- `before/producer.cjs` and `before/results.json`: fixed source console canary leak=true; UI canary=false.
- `audit.cjs --after` and `after-results.json`: fixed public files with the repaired local app, same real listing caller; console leak=false and fixed listing-stage record present. Served source and producer SHA-256 are recorded.
- Product tests exercise actual `driveFetch`→`loadFiles` error reporting and separately auth/network/fixed-code classification against injected message/stack/URL/token/payload canaries. Both pass; related update response/deadline tests also pass (5/5 focused total). App syntax and scoped diff checks pass.
- `source-audit.cjs` / `source-inventory.json`: exact hashes for 17 fixed Git owners/producers. Fixed copies under `fixed/` allow independent auth-logger checks without changing product source. The three fixed auth tests for provider rejection, live diagnostic wiring and checked-in diagnostic flag pass.

## Other verified scope

Anonymous candidate GET `/api/session/credential` returned403 `forbidden`, and GET `/api/not-a-real-endpoint` returned404 `not_found`. Both were `no-store`, returned no Set-Cookie and no credential-shaped response fields. These are two negative responses, not authenticated authorization coverage. A single live app.js identity comparison matched the fixed Git app; the full delivery audit was not repeated. Chrome MCP was attempted first but reported an existing MCP-managed profile lock; a fresh isolated Playwright context was used without touching that profile.

The app media diagnostic detail filter rejects unknown credential/file/URL/raw-byte keys; trace file identity is a per-playback ordinal, and its sink is opt-in. SW holds scoped credentials for original Range requests rather than putting them in public shell caching; credential paths are handled by the auth Worker. Auth errors return fixed codes/no-store; cookies use Secure, HttpOnly, SameSite=Lax and host scope. Refresh credentials are encrypted server-side with AES-GCM and account-associated data; client secret and key values are server bindings, not public asset inputs. The public build uses an exact allowlist, and the candidate deploy materializer requires a clean checkout and replaces public assets from committed Git blobs. Source inspection and injected tests substantiate these bounded owner claims; they are not a complete adversarial auth or media qualification.

## Hosted logging limits

The fixed `worker/wrangler.jsonc` sets `observability.enabled=false`; it enables auth diagnostics, whose default logger outputs only a fixed stage from an allowlist. Neither Logpush nor Tail Worker consumers are configured in that file. Existing deployment producer and configured logging source were inspected, but remote control-plane overrides, connected tail sessions, dashboard/export destinations and historical hosted log contents were not accessed.

[Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) documents stored invocation/custom logs and request-URL invocation metadata. [Real-time logs](https://developers.cloudflare.com/workers/observability/logs/real-time-logs/) are a separate surface and can include request URLs/headers. Therefore the disabled stored-log configuration does not prove that OAuth callback query strings or session headers have never appeared in another hosted logging surface. No absence claim is made for those surfaces, nor is whole SE02 claimed from a quiet console or the two anonymous responses.
