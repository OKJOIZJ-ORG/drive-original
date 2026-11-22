# Release 1.24.4 — D153–D156 (D157 standing deploy rule)

| Item | Value |
|---|---|
| Change | D153: a file the device cannot play (VP9 in MP4 on iPhone) gets the Google preview / Drive offer instead of "원본 재생 확인 필요". D154: per-device view counts. D155: label centring, raised-surface controls, error actions two per row, equal dialog buttons. D156: a view needs min(30 s, 70 %) of playback (photo 2 s); shown-and-left files count as passes; random shorts and random sort order never shown → passed → viewed. Structure cleanup (dead functions, one content identity key list, `scripts/README.md`). |
| Commits | 4a9c30c, dd7256c, 1013b4d, 82110a2 on `claude/playback-fallback-and-rank-20261122`; `main` fast-forwarded fc6ff51 → 82110a2 and pushed |
| Worker | drive-original version e70300d9-97e3-4967-a27e-49f3089a66b4 (`npm run deploy:release`, dry run first; 20 changed assets; bindings unchanged) |
| Tests | 1194/1194 on the committed tree (`node --test tests/*.test.js tests/*.test.mjs`) with the held D-149 code parked; its patch hash was the same before and after |
| Served bytes | 92/92 public files equal to Git 82110a2; 7 private paths 404; anonymous credential 403 with `Cache-Control: no-store` (`qa/release-1.23.26/served-check.cjs`, `served.json`); version.json 1.24.4 |

## Observed

- Production `?demo=1` in the AI Chrome: `APP_VERSION` 1.24.4, the D153/D156/D155 functions present, segmented labels trimmed (`text-box-trim: trim-both`), no console errors or warnings.
- Local demo before release (recorded in `memory/SESSION-LOG.md`): a 60 s clip at 8x reached the view at 30.1 media seconds; a seek from 1.8 s to 45 s added nothing; closing before the threshold recorded one pass; the Drive offer panel showed four buttons two per row at 375 and 1440 px with no ui-audit findings.

## Not verified

- The user's iPhone: the VP9 file now ends at the Google preview / Drive offer, not at playback in the app. Whether the Google preview iframe plays a private file in the iPhone PWA (Safari third-party cookies) is unknown; "Drive에서 열기" opens it at the top level.
- Signed-in production playback of the new viewing threshold across two devices (sync of `viewCounts` and `passCounts`).
- WebKit fonts for the trimmed labels (A-016 stays partial).
