# Release 1.24.5 — D158 (released under D157)

| Item | Value |
|---|---|
| Change | D158: on WebKit (iPhone, iPad, desktop Safari) the "cannot play in the app" offer leads with "Drive에서 열기" as the primary button and says so; the embedded Google preview stays as a secondary button. Other browsers unchanged. |
| Commit | af32736 on `main`, pushed |
| Worker | drive-original version 404fb4f0-de77-43e8-89ca-e115a7d6ac24 (`npm run deploy:release`, dry run first; 6 changed assets) |
| Tests | 1195/1195 on the committed tree with the held D-149 code parked; its patch hash was the same before and after |
| Served bytes | 92/92 public files equal to Git af32736; private paths 404; anonymous credential 403 with `Cache-Control: no-store` (`served.json`); version.json 1.24.5 |

## Cause

The user reported that the 1.24.4 fix did not work on the iPhone. The file is private (owner only). The embedded preview plays it in desktop Chrome, which sends Google's cookies to the frame. WebKit blocks third-party cookies by default, so in the iPhone app the same frame has no Google session and shows a sign-in or no-access page (assumed from WebKit's default; not observed on the device). No account-state writer file changed after the 1.24.4 deploy, so it is unknown whether the iPhone ran 1.24.4 at that time.

## Observed

- Local demo with an iPhone user agent at 390×844: buttons "Drive에서 열기" (primary), "Google 미리보기", "다시 시도", "닫기"; message ends "Drive에서 열어 보세요."; ui-audit 0 findings.

## Not verified

- The iPhone app itself: that it now runs 1.24.5, and that "Drive에서 열기" opens and plays the file (in Safari or the Google Drive app, with the user's Google sign-in there).
- Playback of VP9 inside the app on iPhone remains unavailable (D153).
