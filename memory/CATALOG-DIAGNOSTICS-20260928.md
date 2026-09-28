# Catalog comparator diagnostic preparation — 2026-09-28

Local QA preparation for A-012; no current media body/probe replay, Drive write or
actual-account run occurred in this unit. rc.11 product/state commit7f2e467 is
unchanged. D-059 current WP-08 normal runtime acceptance remains the next step.

The former final comparator catch discarded the maintained RootInventoryError
code and reduced every failure to CATALOG_DRIFT. The additive QA path preserves
one of eight fixed comparator codes plus redacted account/root/counter flags and
item/shortcut added/removed/changed counts. Unknown errors or diagnostic failures
retain CATALOG_DRIFT/complete=false with diagnosticAvailable=false; no private
rows, IDs, names, hashes, bytes, URLs or tokens are exported. Canonical row/root
normalizers remain inside the maintained core's private closure.

The separate metadata-only constructor runs two fully repeated root inventories,
compares them once, and cannot request media bodies or writes. It fences the
current account/generations/credential and active controller identity. It does
not require or pretend a fresh live SW runtime VERSION; the report says false.
Success now sets complete=true only after both full inventories and comparator
pass; drift/failure remains false. Root review found that missing success flag
in the first draft and the focused assertion was added before this savepoint.

Observed focused checks: diagnostics/metadata11, affected catalog3 and media
bundle1 pass. New builders emit distinct filenames and normalize their source
inputs to LF. The existing executed current-corpus-browser-bundle.js is exactly
the HEAD bytes/SHA4d3bc9686682c0b7ef6522ec7461e71b7b56d74a0d4135c434d04f6262dd6a04.
An initial builder overwrote it during preparation; that draft was retained under
the distinct diagnostic name and the historical artifact restored before commit.
Existing live reports/frozen producers were preserved. No actual result is
inferred from these local checks; the historical A-012 cause remains unknown.

State-test first-failure output is preserved byte-for-byte as gzip, compared with
the original7f2e467 Git blob. This avoids the raw log's two whitespace-only spacer
lines conflicting with git diff --check; the original plain text also remains
ignored locally and recoverable in Git history. No product behavior changed.
