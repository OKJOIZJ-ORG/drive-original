# Q0 product snapshot integration — local rc.14

`fullcheck.cjs` runs the explicit existing product suite plus Q0 helper/proxy cases. Final result:452/452, no skipped/cancelled/failing tests, all watched sources unchanged. `full-product-rc14.json` binds exact source/test/producer hashes; its raw output is retained separately.

The independent `native-audit.cjs` uses actual app, SW and installed isolated Chrome with a synthetic provider. Decode,90%seek and close pass. The record does not claim real Google or device acceptance. `native-results-manifest.json` binds41 current app/SW cases and explicitly records the native-proof deltas: rc.14 version metadata, direct full-original Headers serialization and absent-resource-key removal. Failed account-key/header attempts and the prior40-case manifest remain intact.

The scoped materializer has15 shell scenarios: exact committed output, dirty or untracked public/build/Worker input, hidden source edits, missing HEAD blobs, extra/missing artifact entries, source/output links/hardlinks and source/HEAD changes. It captures HEAD and rechecks all protected inputs. No directory transaction/lock is claimed; late concurrent changes fail and may leave partial _site, so the deploy command must stop on failure and publication inputs must stay fixed through Wrangler. Unrelated nonpublic preparation files never enter its output.

Only the four task-owned modified test files were normalized to the maintained LF checkout policy before the final452-case run. `shell-test.producer.js` preserves the independent pre-normalization raw producer and its hash; execute the maintained test path, not this historical byte copy. Public source bytes and Q0 protocol producers are unchanged by that mechanical normalization.

The separately committed actual-provider disposable A/B proof remains in `qa/q0-revision-pin-disposable-rc13b`; no new original-media or retention mutation is performed here. Current candidate delivery/actual-account replay and upgrade ordering have their own records. Q1/Q2 preparation assets are outside this candidate's public allowlist.
