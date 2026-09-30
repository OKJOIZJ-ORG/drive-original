# Unit21 independent bounded integration review

Reviewer: gpt-6.1-sol, high. Product, tests and implementation evidence were read-only. No suites, browser, provider traffic, private account access or product edits were performed by this reviewer.

## Verdict and exact source

No remaining confirmed source defect was found in the bounded change that retires a Q1 owner after its controlling worker changes and offers explicit document reload. This is not an end-to-end reload/reopen acceptance pass.

The reviewed native-source freeze is app.js SHA-256 `5c873efaaf4b9e390a6cb5b2a6057ef1aaa060e2a64d548ebfc3f6f6ffbba480`; tests/controller-change.test.js SHA-256 `df6593f3cb1b01e7e8974ef6de3c278c3fe1fe1ff29bea94af8c13be8b30e0f5`. Root subsequently changed only APP_VERSION from rc.20 to rc.21. Current app SHA-256 `291bde76ad7f649422603e1d735766b0fcc5091fb9a9214ce2991689f48818b0` normalizes exactly to the native-source freeze when that single version declaration is restored. No native execution of current rc.21 bytes is claimed here.

## Causal and lifetime review

app.js lines1816-1854 capture the selected Q1 file/session/account/account generation and exact controller. A changed controller causes immediate canonical source retirement before delayed UI work. The completion closure checks file, media/playback session, account ID/key/generation, source/route generation, immutable pin, absent newer owners, visible sheet and expected attempt. An unchanged controller or stale account/session does not enter this recovery branch. The added owner fields at line8147 bind that decision to the actual playback lifetime.

The old worker's unconfirmed retirement remains sticky. No replacement-controller success is treated as settlement proof; no persisted continuation, automatic original restart, preview downgrade or credential refresh was added. The retry action at lines10556-10562 reloads the document before existing authentication/source actions. Fresh retirement state comes from document replacement, not assignment or waiver in this document.

An earlier independently confirmed gap is closed: closing before retirement and selecting another file invalidates the old UI closure but retains the false barrier. Previously the next-file error could offer ordinary retry and repeatedly hit that barrier. The final error label and retry action also recognize `q1RetirementResult.settled === false`, providing the reload action through the existing initial-playback gate. The maintained test exercises that ordering and verifies no source or grant request and no barrier reset. No late closure can promote a changed file/account to this old owner's recovery UI.

## Verification actually reviewed

The maintained actual-app VM tests and saved logs discriminate immediate retirement, TS/general/probing owners, eleven delayed-cleanup invalidations, repeated controller replacement, unchanged/stale ownership, expired credentials, closed selection and close-before-cleanup/next-file recovery. The recorded 19 focused and 5 selected existing contracts pass; they were not rerun. The exact prior CP949 producer and labeled later failure replay are retained, and the corrected UTF-8 test hash is bound above.

The final native v6 producer and raw record independently bind the same frozen source, exact executed producer and unchanged before/after public-source hashes. They prove the first real replacement aborts/removes Q1, changes source generation, retains pin/snapshot, hides controls, displays reload recovery and preserves false retirement. The producer asserts no provider request after the barrier, then clicks the actual retry button with expired credentials and observes real navigation. The fresh document has true initial retirement, no selection/source and no new original/grant request. Browser and server close are recorded.

`qualification-v6-results.json` remains aggregate false: reopening then observes another controllerchange at 3826ms, retires again with visible worker-update-required/false retirement and times out without a new decoded frame. All served post-toggle main scripts have the same replacement hash, but imported-script/cache/activation continuity was not captured. The cause of the second replacement remains unknown. The reviewer does not convert positive intermediate assertions into a whole-chain pass.

`stable-document-results.json` is separately true. Its fixed-worker-from-startup document presents an actual TS frame with current owner/account/account generation/source generation, then trusted Escape produces settled cleanup with no selected owner/source. This validates stable-document playback and close only; it does not resolve the failed replacement/reload/reopen chain.

All 25 entries in the implementer's curation manifest matched their exact bytes at review. The final v6 and stable-document producer hashes and before/after source fences matched independently. A shell quoting error in the review's first read-only hash expression produced no checks or mutations; the corrected stdin expression completed those bindings.

## Limits

The bounded visible-update recovery/source integration is clean. Whole reload/reopen recovery remains unqualified and its repeated-replacement cause remains open. Whole QA-SW-01/REL-02, old/new shell or offline compatibility, account-expiry position continuity, other media paths, real-account/physical-device/two-device behavior and production are not promoted by this review. Parent owns integrated full tests, version metadata, commits and any further acceptance.
