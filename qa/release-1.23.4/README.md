# 1.23.4 operating verification — D090

User “반영해줘” approves the concrete prepared UI/library/video patch. Runtime `e677852`, unchanged origin https://drive-original.jyw-drive.workers.dev/, Worker `4d0146e1-faff-455c-b568-e980dc40cea1`. Full `7399829..7ad092d` product diff independently reviewed; final version-only alignment checked separately. Main fast-forward/push and Worker deploy succeeded; no extra grant, original media write, Notion or automation restart.

| Evidence | Verified scope | Receipt |
|---|---|---|
| Local product | 922/922 before version-only alignment; final static/shell36/36, app/SW syntax and diff checks | workspace maintenance/tools/video-startup/product-tests.log and release-1.23.4/release-checks.log |
| Immutable distribution | 64public Git blobs +.nojekyll,65entries,56,832,921-byte ZIP; all Git-equal | [package.json](package.json) |
| Operating serving/security | Five changed public200/Git-equal; five private404; isolated valid anonymous401/no-store | [served.json](served.json), [acceptance-summary.json](acceptance-summary.json) |
| Existing backend ownership | All11binding objects equal, same auth namespace/four secrets/origin | [bindings-comparison.json](bindings-comparison.json) |
| Actual ordinary update | Existing normal Chrome1.23.3→update button→1.23.4, login retained, exact current18liked IDs/account same by nonretained digest | [actual-browser.json](actual-browser.json) |
| Actual library/UI | Freshㅇㅎㅎentry atscroll0 collects2051supportedmedia/2folders without scrolling, complete/no cursor/error,240cards, border0px; capture visually reviewed | same actual receipt; maintenance/tools/release-1.23.4/actual-library.png |
| Actual playback/cleanup | One5.55s native clip, first owned frame6773ms,111decoded frames/ready4/error0/end5.55, original transport/decode true, pendingwarming0→ready6; normal close/probe cleanup/originalfolder | same actual receipt |
| Actual current shell cache | Four changed cached assets match served/Git SHA256; SW itself intentionally not shell-cached | same actual receipt + acceptance summary |

`actual-browser.json` contains no real filename/file ID/account identifier/fingerprint/credential/media URL. Trace stages retain only names/source/elapsed time. This is finite actual normal-PC operating evidence. Native mobile QA from D088/D089 is emulation; no new physical Android/iOS, all-format or sustained qualification. One startup6773ms with uncontrolled cold/cache/network state proves working presentation, **not a speed improvement**. Historical45second cause remainsUNKNOWN.

Retained failures and recovery: [materialization-first-failure.json](materialization-first-failure.json) preserves the initial output-check failure; immediate inventory found65expected regular files, then unchanged materialization retry and independent package equality passed. No initial cause is inferred. Wrong folder selector caused a read-only style probe exception; actual folderStrip0px read and screenshot resolved it. Nonfocusable player-section Tab failed; focusable video-stage Tab exposed close and normal close succeeded. Neither UI-tool failure changed product code or weakened acceptance. Private deploy/config outputs stay under workspace maintenance/tools/release-1.23.4; only sanitized results are maintained here.

Publication inputs remain owned by existing public allowlist/materialize scripts. ZIP/extracted package under workspace releases; prior packages are preserved. Documentation-only completion commits need no product redeploy. [Release owner](../../memory/RELEASE-1.23.4.md) records delivery and historical limits.
