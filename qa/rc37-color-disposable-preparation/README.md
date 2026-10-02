# rc.37 color disposable fixture preparation

This leaf reuses the restricted disposable creator from `qa/q3-actual-preparation`
for one new color-test folder and one immutable test video. It is bound to Git
commit `051dc3456f5000b958a18593848769b3687991e5`, runtime `1.22.0-rc.37`, and
the exact source hashes for `app.js`, `sw.js`, and `version.json` recorded in
`disposable-binding.json`. The fixture is
`qa/fm05-controlled-diagnostic/subtitle.mp4`, 659,966 bytes, SHA-256
`d9a1cc3f12a7a3b3a91f408e59da8e1f9b8dfb2e4ec26dd8d969cedc27893037`, and MD5
`cc7a0da5f6e2b89a9fdee916d259d285`. The supplied first-16-KiB header SHA-256 is
`e8e8e98b9316acba11449c26a947281229bd481b8729fb21d4e34de2d3cded3e`.

`disposable-build.json` records `actualExecution: false`, the immutable runtime
binding, fixture fingerprints, generated factory SHA-256 and byte count, and
producer-file hashes. The builder reads the three product files only from the
specified Git commit; it rejects another commit or version. The fixture bytes
are read locally for fingerprinting and tests and are not copied into this leaf.

Build and run the local-only checks from `source`:

```powershell
node qa/rc37-color-disposable-preparation/disposable-build.cjs 051dc3456f5000b958a18593848769b3687991e5
node --test qa/rc37-color-disposable-preparation/disposable-test.mjs
```

The test suite uses an in-memory provider and synthetic owner state. It checks
the exact fixture bytes, source and capability fences, persisted intent before
the two creation POSTs, fresh metadata receipts, duplicate-run denial,
GET-only recovery after an uncertain POST, recoverable trash, no retry after an
uncertain cleanup PATCH, owner/capability/metadata drift rejection, and bounded
cancellation. Its chooser case verifies that the visible input has ID
`color-disposable-fixture-input-37` and label `Color disposable fixture input`;
selecting the file only captures and hashes it into `__colorFixtureBlob37`.
That action reports zero provider requests and does not call upload. The creator
is invoked separately by the root owner after admission.

## Root-owned execution order

1. Rebuild and pass the local tests. The live owner separately rechecks exact
   rc.37 source proof, the existing `driveWrite` capability, loaded and idle
   account state, current controller, and the prepared color observer. Stop if
   any admission changes or fails.
2. Install `disposable-file-input.function.js` in the already owned rc.37 page
   context. Use the supported file chooser to select exactly the fixture path
   above. Call the returned input owner's `capture()` only after the chooser
   settles. It must report `exactBytes`, `exactSHA256`, and
   `automaticUpload:false`. It never starts the creator.
3. Evaluate `disposable-factory.expression.js` and
   `disposable-facade.function.js` with the exact `disposable-binding.json`
   binding and the current source proof. Call `creator.create` explicitly with
   `__colorFixtureBlob37`. This is the only creation operation: one tagged
   folder, one tagged video, two generated IDs, and two POSTs. There is no retry.
4. Keep the run ID privately. Before calling `creator.clear()`, read
   `creator.privateText()` directly into the root owner's private save path with
   exclusive `wx` creation and a unique filename. Never print or return the
   text, IDs, account fields, pointer, or metadata. Read back only the saved
   byte count and SHA-256. Keep every saved version; do not overwrite an earlier
   private save. If the save fails, retain the live owner and stop before clear.
5. Create a fresh facade with `{recoveryRun: privateRun}` and call `capture()`.
   This is GET-only and requires two stable passes of the exact IDs plus a
   bounded complete child listing. Only a successful fresh capture may call
   `installTarget()`, which sets `__colorActualTarget37` for the separate color
   observer. Save the private ledger again with a new exclusive filename before
   clearing the job. Keep the target holder until the observer finishes.
6. Run the color observer against that target. After observation, release the
   holder with `clearTarget()` and clear the file input owner. Then create a
   fresh recovery job and call `cleanup()`. Cleanup recaptures current state,
   verifies the exact fixture and empty folder, then recoverably trashes the
   video and folder with two PATCHes and independent readbacks. It has no
   permanent-delete, move, retry, or arbitrary-endpoint operation.
7. Save the final private ledger with a new exclusive `wx` filename before
   clearing the cleanup job. Report only safe pass/failure codes, counts, and
   backup hashes. A missing receipt, drift, rejected request, or uncertain
   POST/PATCH stops the sequence. For an uncertain result, use the same private
   run for fresh GET-only recovery; never make a replacement run or resubmit.

`privateText()` and the private target contain account and remote metadata.
Keep both inside the root owner's protected storage and out of console output,
model messages, repository artifacts, and Git. The only persistent namespace
used by this preparation is the distinct
`drive-original.qa.disposable.color-exact-fixture.<fixture-sha256>.run` pointer
plus that run's recovery ledger. The purpose is `color-exact-fixture`. Existing
Q3 ledgers, fixtures, namespaces, and QA files are not inputs to this run.

This document and the checks prepare an inert local runner. They do not claim an
actual upload, Drive readback, browser playback result, or cleanup.
