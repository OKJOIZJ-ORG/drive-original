# Unit20 independent integration review

Reviewer: gpt-6.1-sol high. Product, maintained tests and implementation evidence were read-only. Only this new review README and manifest are owned by the reviewer.

Verdict: no remaining confirmed material finding in the final reviewed image-owner dispatch unit. The verdict is bound to the app/test bytes in `manifest.json`; it is not whole-format, device, account, hosted or production acceptance.

## Findings and closure

The first implementation correctly dispatched the saved 197-byte PNG from its pinned bytes, but its subsequent classified service-worker recovery still derived `isVideo` from declared `video/mp4`. Buffer fallback therefore sent the PNG back to the video element. The existing range retry also recreated a video owner. This was confirmed from the concrete source control flow and acknowledged by the implementer.

The final implementation uses the verified selected-lifetime image kind for classified recovery. Verified-image range retry preserves the same selected media session and immutable pin, consumes the existing retry budget, waits for prior retirement and assigns the existing image route. Normal image metadata and valid-video branches remain unchanged. Focused assertions now discriminate both worker buffer fallback and image retry; the final-source native worker control observes the injected 503, successful original-image fallback, original SHA/alpha/viewed behavior, same-session image retry, retry count 1, hidden video controls, and settled close/reopen.

A related control boundary was identified: clearing the video source does not guarantee its guarded pause event will refresh already visible video controls. The final handoff explicitly calls `updatePlayPauseUI()` after hiding the video. The source-bound native producer deliberately sets custom video controls visible before handoff and asserts they are hidden after image presentation. Repeating the passing native cases merely to copy an additional setup boolean was unnecessary.

## Integration assessment

- The existing 12-byte pinned Q0 read is reused. Only a recognized raster prefix gets the additional structural read, bounded to 64 bytes; metadata or filename alone never selects the image route. HTML, JSON and SVG are excluded from this signature dispatch.
- Existing metadata, permission, immutable-pin/account/checksum and authenticated reader checks remain responsible for source admission. The temporary reader must close with settled cleanup before returning the image kind.
- Image handoff runs outside `owner.setupDone`, so retirement does not wait on its own handoff. It joins settled Q0/Q1 retirement and rechecks file, media/playback session, account identity/generation, source/route generation, service-worker controller, pin and visible selection before assigning the image source.
- The verified kind is private to the selected immutable-pin lifetime. Reset clears it; selected/session/account/pin changes invalidate it. It does not rewrite catalog MIME, create a global format cache, convert image bytes or replace full originals with thumbnails. Existing image decode and visible-presentation gates still own viewed recording.
- `formatDecision` separates raster handoff from optional audio inspection. Native code4 waits for the image decision/handoff, then rechecks its old owner. Non-raster decisions release this wait before optional ISO audio capability work. Retirement still joins `setupDone`, avoiding a self-wait cycle and preserving source cancellation/cleanup ownership.
- Structural header admission is not full-body decode proof. Existing native decoding remains authoritative; the reviewed negatives distinguish failed/unviewed/no-image/no-iframe from successful image display.

## Evidence level

The independent reviewer inspected the scoped diff, actual owner/source/viewed/recovery functions, focused assertions and saved producer/result bodies. The reviewer did not run product tests, browsers, network calls or private-account actions and did not edit product code.

`focused-tests.txt` records 80/80 passes on the final reviewed app/test source. Final-source native records use Chrome 154.0.8037.58 and synthetic provider data only, with stable producer source hashes and closed isolated browsers. PNG, delayed 2.5-second PNG and animated WebP viewer cases pass; H264/AAC native control and HTML/JSON/truncated-PNG negatives pass. The complete valid-video provider category/range sequence equals the fixed rc.19 baseline, including `0-`, `0-11` and `0-65535`, without an image-only `0-63` read.

`post-review-results.json` remains an aggregate failure because its worker-control row used a QA mode assertion that rejected the valid `original-opfs` result. Its three viewer rows are passing evidence. The exact initial producer and failed row are preserved. `post-review-png-worker-recovery-results.json` is the separate passing rerun after that QA assertion accepted original OPFS/memory modes. The failed aggregate was not relabeled as passing.

Earlier native records bind the preceding `169799d...` app source and remain prior evidence. Final-source records bind `03d25a...`; `manifest.json` records exact hashes for the reviewed source, focused log, final-source producers/results and baseline video control.

Remaining limits: full real-corpus/Q3 decisions, physical and two-device behavior, real account/expiry/hidden-return behavior, hosted delivery and production remain outside this review. Root owns rc.20 version metadata, integrated checks, staging/commits and any authorized candidate delivery.
