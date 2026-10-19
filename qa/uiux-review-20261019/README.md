# D095 UI/UX review — 2026-10-19

`capture.cjs` serves the working tree to isolated headless Chrome in demo mode (`?demo=1`, service workers blocked, Google hosts aborted; no Drive request) and records 10 states × 4 viewports (1440×900, 820×1180, 390×844, 320×640): screenshots, horizontal overflow, targets under 32px and axe-core violations. Screenshots stay in workspace `maintenance/tools/uiux-review-20261019/{before,after}`; `after-report.json` is the final sanitized report.

Before: axe `button-name` (critical) on `#refreshButton` at 390/320px — its visible label is `display:none` on phones. Visual review: folder rows repeated a "폴더" text label while their chevron rendered 0×0 (SVG without size in an unsized grid item); every card footer repeated "원본 파일 재생/원본 이미지 보기", truncated at 320px; the confirmed but destructive "모든 세션 연결 해제" was the most prominent filled red control in settings.

Changes: refresh button `aria-label`; folder chevron sized 16px and the redundant "폴더" label removed; card status slot shown only for informative states (split-part label, 다운로드 제한); disconnect uses the existing `danger-text-button` style shared with 강제 캐시 새로고침. Confirmation dialog unchanged.

After: no axe violations, no overflow or page errors in any of 40 states. Remaining small-target notes are intentional: mouse-only 28px compact icons (44px under coarse pointer), the 28px-tall brand link and the full-width 24px bottom controls entry zone.

Not changed: demo video shows the "재생할 수 없습니다" dialog with 다시 시도 (demo-only); the `1.0x` text seen in the user's real Chrome accessibility tree is not app DOM (all app speed labels are hidden/inert when the player is closed) and is most likely a browser extension. Limits: demo data, headless Chrome only; no real account, physical device or WebKit run.
