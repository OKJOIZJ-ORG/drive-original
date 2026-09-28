# Fixed baseline qualification and package — 2026-09-29

The original specification's 69 acceptance IDs are preserved exactly. The fixed
`b9d873926e894bb89a9faa8e638f7f0a80c0eb7e` candidate review now records 24 passed,
39 not-run, four blocked and two conditional not-applicable rows. Conditional
HLS/media-relay exclusions do not waive general format, Q2/Q3 or physical-device
requirements. Source inspection, fixtures and actual-account evidence retain
their distinct scopes.

QA producers `qa/candidate-rc11-package/contract-acceptance-audit.mjs` and
`qa/candidate-contract-completion-rc11/contract-completion.mjs` load fixed Git
blobs rather than concurrent working product files. Their 10/10 and 28/28 scoped
checks cover exact Range edges, refresh schema, uncertain applied writes without
replay, offline merge, partial batch/account change, ID-based shortcuts, foreign
request rejection and SW-owned cache migration. External providers are synthetic.
The review report preserves every evidence pointer and remaining real gap.

The public-only 19-entry baseline ZIP is saved outside the canonical repository:
`releases/candidates/Drive-Original-1.22.0-rc.11-b9d8739.zip`, 860,165 bytes,
SHA256 `8170e862392a3efcc64334767927754cee89d394ad4cae0e82cb9028b9ba01bc`.
The maintained builder compares all saved entries with fixed Git blobs, checks
CRC and rereads the saved file. It contains no account/credentials/private QA.
This is a preserved baseline, not the upcoming fixed candidate or final acceptance.

Evidence owners: `qa/candidate-rc11-package/qualification-matrix.md`,
`qualification-review.json`, `package-results.json`; contract leaf README/results.
No production/main/push/Notion, original media or volume work occurred.
