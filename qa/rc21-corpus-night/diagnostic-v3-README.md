# v3 metadata-only failure discriminator

`factory-v3-diagnostic.expression.js` is a separate producer. It does not overwrite the
executed v2 expression or its source/provenance/evidence. Call the same lexical facade
with its fourth argument `metadata-only`; private context and SW proof stay page-local.
This retains before and after inventory runners (each independently performs two full
passes), final catalog comparison, original owner/facade guards, and zero media reads.

The actual v2 record stopped at100 metadata requests and16,386,895 bytes. These values
do not reach the existing512 request or64MiB aggregate caps. Actual completion time
and original trigger were not retained. The original metadata cleanup can overwrite an
earlier HTTP/body/parse/response-limit or10-minute run-timeout cause with CLEANUP_FAILED.
No cause is established from those aggregate numbers.

This producer adds only redacted metadata diagnostics: route class (about/list/file),
ordinal, inventory/probe phase, stage, status, per-response limit/received bytes,
aggregate received bytes, original fixed failure code, allowlisted error class,
run/account/caller/request-deadline abort source, and the separate cancellation stage,
error class and original trigger. It records no URL, query, IDs, tokens, response text,
page tokens, names, request headers, original error text, or private inventory rows.
Terminal cleanup failure semantics, caps and honest generic cleanup unknown are unchanged.

The inventory budget is512 GET/64MiB aggregate/2MiB per response/25s request and
10-minute run. Mode metadata-only avoids the8 media samples and their16 exact identity
GETs. Existing before+after envelopes can use roughly136 metadata GETs on the observed
68-request first inventory shape; this is an estimate and may drift with the catalog.
An all8-sample result is not full CORPUS06 or full representative prefix coverage.

Build: `node qa/rc21-corpus-night/build-v3-diagnostic.mjs`.
Verify: `node qa/rc21-corpus-night/verify-v3-diagnostic.mjs`.
