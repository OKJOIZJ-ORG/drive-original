# v4 metadata-only inventory denominator producer

`factory-v4-denominators.expression.js` is a separate stable producer. Neither v3 nor
v2 expression/source/evidence is overwritten. Call the lexical facade's fourth argument
`metadata-only`; this producer rejects `probe` mode before any network I/O.

It copies only the maintained redacted inventory report's allowlisted counts, extension/
MIME/size bands, per-pass pages/traversal/completeness, numeric capabilities/risk,
metadata availability and known-size bytes. Before and after snapshots record the
observed cumulative metadata requests/bytes. It copies no object row, name, identity,
raw unknown extension/MIME, URL, credential, response text or diagnostic error text.

`probeDenominators` explicitly separates metadata representative selection and old
diagnostic track candidates from scheduled/probed0 media objects and current unprobed
counts. `wholeCorpusComplete` is always false. `complete` means only the before/after
metadata envelopes and final catalog comparison succeeded. The overlapping MIME-video
and video-extension counts are shown separately; their union is null until a private
unique-object set supplies an actual denominator.

All v3 redacted failure diagnostics, normal owner fences,4 complete inventory passes,
512 metadata requests/64MiB/2MiB per response/25s request/10-minute run, final comparator,
and unchanged cleanup failure semantics remain. Bodies and playback are not read.
The selection's5ISO/1WebM/2unknown/8 candidate plan remains an unexecuted prior plan;
the producer does not broaden it or count it as full corpus coverage.

Build: `node qa/rc21-corpus-night/build-v4-denominators.mjs`.
Check: `node qa/rc21-corpus-night/verify-v4-denominators.mjs`.
The concrete proposed next sequence is in `whole-header-pathway.md`; it defines bounded
representative prefixes, rare/failure/minority metadata combinations, whole video union
batches, cohort resource ledgers and fresh-owner continuation across natural renewal.
