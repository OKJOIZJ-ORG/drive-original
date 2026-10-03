# Safari syntax build and corresponding source (local)

This is fresh 2026-10-03 local evidence. The historical
`qa/q1-general-product-preparation/publication-*` receipts remain unchanged.
No account, device, publication or deployment acceptance is asserted here.

The existing eight semantic source patches are unchanged. Both the repository
producer and the extracted-source entry use hash-pinned esbuild 0.25.1 with
`--target=es2022,safari17`. The maintained source packaging entry is:

    node scripts/package-general-q1-source.cjs --check --verify

`package-result.json` binds the current archive to its runtime and complete
66 upstream / eight modified / five shared source coverage. Its 82 archive
entries include 81 inventoried source/build inputs plus the source manifest.
`extraction-verification.json` records the fresh archive extraction's direct
rebuild, checking all 81 inputs and reproducing the exact runtime bytes.
A second `--check` repack matched the same archive bytes. Extracted directories
are generated local work and need not be committed.

`tests/safari-module-build.test.mjs` passed both checks: the generated bundle
contains no `using` declaration, and a fresh VM realm without native
`Symbol.dispose` successfully imports it. The real lowered conversion path
keeps its temporary RGB sample alive through asynchronous copying and closes it
exactly once on success, copying rejection, and format rejection. It preserves
the separately owned original sample until its explicit close. This is local
JavaScript behavior, not Safari/WebCodecs/device proof.

Focused general media regression:

    node --test tests/general-q1.test.mjs tests/general-retention.test.mjs tests/general-audio-probe.test.mjs tests/general-selected-audio.test.mjs tests/general-q2-end.test.mjs

All 59 checks passed, covering source clocks/packets, bounded ownership,
admission/capability cancellation, exact audio selection, and final fragments.
