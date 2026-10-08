# 1.23.5 operating verification — D093

User requested only loading status/progress and explicitly authorized deployment, including completed D091 rounded-dialog/mobile hold2x and D092 photo-control patches. Independently reviewed full product change from mainf3463f1; no concrete blocker. Runtime5f381601fdf181ce3d7ea2d3a0be1475d81a9376, same operating origin https://drive-original.jyw-drive.workers.dev/, Worker7c761d33-b55d-44af-86da-1b845092bab8. Main fast-forward/push and Worker deployment completed. Documentation-only final commits do not alter public bytes.

| Evidence | Verified scope | Owner |
|---|---|---|
| Product tests | Final1.23.5 full932/932; app/SW syntax and diff whitespace pass | workspace maintenance/tools/release-1.23.5/product-tests.log |
| Minimal loader | Four Chrome layouts,24status/progress/reset/ready/error states; exact final app/style/shell hashes | [local native QA](../minimal-loading/README.md) |
| Pending D091/D092 | Historical scoped rounded paint/scroll,19trusted native hold cases,14photo captures/4video recoveries and persistent-state supplement | [rounded surfaces](../rounded-surface-clipping/README.md), [hold speed](../mobile-hold-speed/README.md), [photo controls](../image-control-cleanup/README.md) |
| Immutable distribution |64public Git blobs+.nojekyll/65entries,56,833,709byte ZIP; extracted and ZIP all Git-equal | [package](package.json) |
| Operating public/security | Five changed public200/Git-equal, five private404, isolated valid anonymous credential401/no-store | [served](served.json), [summary](acceptance-summary.json) |
| Backend continuity | Same Worker/name/subdomain; all11binding objects and four secret names equal before/after | [comparison](bindings-comparison.json) |
| Actual normal update | Ordinary update button1.23.4→1.23.5; same account/exact18likes by in-page nonretained digest; four changed cached assets Git-equal | [actual Chrome](actual-browser.json) |
| Actual original playback | Ordinary rendered short card; observed only 로딩 중 and14/21/36/42/61/100%; native4.295692seconds/end127frames/ready4/error0/loaderhidden/original transport and decode true | same actual receipt |
| Cleanup/library |2051supportedmedia/2folders/240cards/no next cursor/error; normal close, original folder, priority release, diagnostic observer/sink and private marker cleanup | same actual receipt |

Native progress calibrations are explicitly separate from ordinary demo-image source events and actual account replay. Prior D091/D092 source hashes remain historical. The actual single clip reached its first owned decoded frame2948ms after intent under uncontrolled current state; this is working playback, not a startup speed gain or upper bound. No new physical Android/iOS, human finger/OS-edge, sustained or all-format acceptance.

Retained local failures: removing the loading-only locationLabel also removed its post-load codecNote binding; one full-original permission-fallback test failed931/932. The label is now declared at its remaining use; final932/932 pass. Node's directory test invocation was corrected to explicit discovered test files. Initial compact screenshots preceded delayed reveal; final four-layout run waits for actual paint and keeps the intermediate results separate.

Chrome MCP's profile conflict was recovered only after exact MCP process ownership verification and graceful close; restarted isolated Chrome returns toabout:blank. Normal user Chrome remains on the original folder. An anonymous request without the required CSRF header gave403; valid header request401/no-store owns the security check. Initial likedIds and cleanup-priority probes used nonexistent field names; corrected source-owned fields confirm preservation/cleanup. No product changes were inferred from these diagnostic mistakes.

Only sanitized results are maintained here. Private CLI/config outputs remain under workspace maintenance/tools/release-1.23.5; no raw account/file IDs, fingerprint, credentials or media URLs are in this receipt. Original media, preferences, auth/OAuth, origin, free-operation limits, Notion and automationPAUSED remain unchanged. Ordinary playback may persist viewed state through existing behavior. Legacy Pages remainsgh-pages with old deployment workflowdisabled_manually; main push did not enable it.
