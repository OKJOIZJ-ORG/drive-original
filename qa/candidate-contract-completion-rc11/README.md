# Fixed rc.11 contract completion

`contract-completion.mjs` loads candidate
`b9d873926e894bb89a9faa8e638f7f0a80c0eb7e` Git blobs into the maintained app/SW
VM factories. Fixture file reads resolve to that fixed Git tree, including helper
test files. Concurrent workspace AUTH changes are neither read nor qualified.
Every external provider, file ID, credential and storage object is synthetic;
the default fetch throws. No real browser/account/media/remote mutation occurs.

From `source`, run `node qa/candidate-contract-completion-rc11/contract-completion.mjs`.
It executes 23 selected existing discriminators and five additional cases, rather
than replaying the 368-test product suite. `results.json` preserves each outcome,
new-case observations, exact producer SHA256 and every loaded Git-source hash.
Current result is 28/28. A local contract pass does not imply physical-device,
normal mutation UI, real Google authorization-fault or production acceptance.

`update-qualification.mjs` validates the source specification hash, producer hash,
all 69 acceptance IDs and focused result counts before updating the owned matrix
and review report. It performs no product changes or tests. Run it only when
integrating this fixed-baseline evidence; a newer candidate needs its own review.

Six full contract rows close: ST02, MU05, MU07, SE01, SE03 and SW01. ST01 still
requires actual two-device foreground propagation. SE02 retains public-build
and trace evidence but needs the actual log/process invocation owners audited.
MU10 retains historical guarded restore/recovery evidence; an explicit approved
pre-state comparison for the recoverably trashed file and two retained folders
is missing. Those gaps are not established product defects.
