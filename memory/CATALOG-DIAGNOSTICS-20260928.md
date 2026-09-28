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

## Actual rc.11 metadata-only exit — 2026-09-29 KST

The separate five-leaf rc.11 producer pins exactly one VERSION constant without
changing the rc.10 artifacts. Seven local provider checks pass. Actual Chrome
uses the one exactly named supplied priority file in its loaded folder, with
canonical priority-parent resolution verified by the maintained inventory.
The owned driver completes two inventories, each with complete repeated passes,
then compares them:124GET/22774540metadata bytes, catalogStable/complete=true,
owned media0/writes0, released=true. Active controller/account/credential and
write-quiescence fences hold; equal normal read-refresh is explicitly allowed.
No fresh SW VERSION, physical device or media codec/body claim is made.

metadata-catalog-rc11-live-results.json and provenance.json in
qa/v2-07a-current-corpus-probe/ pin bundle SHA
7d2a35b59afcca28173d642701abe28c3319788072486819250f94913b02c760.
The actual candidate remains sourceb9d8739/app+SW1.22.0-rc.11; documentation
savepointb8de6ed does not change runtime bytes. Private context/object group are
released. Unrelated gallery thumbnail requests are outside the owned-driver
count. Historical A-012's collapsed cause remains unknown; current success does
not rewrite it or promote earlier36per-file media evidence to full device/codec
acceptance. Next existing core check is actual PC30sbackground/foreground Q1.

State-test first-failure output is preserved byte-for-byte as gzip, compared with
the original7f2e467 Git blob. This avoids the raw log's two whitespace-only spacer
lines conflicting with git diff --check; the original plain text also remains
ignored locally and recoverable in Git history. No product behavior changed.
