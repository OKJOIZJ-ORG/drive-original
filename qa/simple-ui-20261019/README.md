# D097 "simple is best" UI pass — 2026-10-19

`capture.cjs` serves the working tree to headless Chrome (demo mode, service workers blocked, every non-local request aborted; no Drive or account), opens the real player shell on the maintained `qa/seek-range-h264-aac.mp4`, and records 10 states × desktop 1440×900 / phone 390×844 (library, card hover, full filename, media error, controls, loading, measured loading, seek, double seek, hold 2×). Screenshots stay in workspace `maintenance/tools/simple-ui-20261019/{before,after}` with `report.json`.

| # | Request | Change |
|---|---|---|
| 1 | "Drive 연결됨" badge | A healthy connection is the normal state and told the user nothing. The badge now appears only for states the user must act on — 오프라인, 재연결 필요, 인증 일시 중단 — as a plain orange dot and caption text (no pill, no glow). Healthy, checking and demo states show nothing (demo already has its own notice line). |
| 2 | Loading/typography | Loader is a 40px ring alone; a measured percentage sits inside it. No box, no visible "로딩 중" (kept visually hidden for screen readers), no extra bar. It fades in after ~240ms so fast starts do not flash it. Seek loading is a small ring at the top right. Transient feedback text is Korean and plain (`음량 60%`, `음소거`, `1.5×`, `+1 프레임`) instead of mono uppercase (`VOL 60%`, `SPEED 1.5X`). |
| 3 | Volume bar | Custom range: 3px track, white fill from `--volume-fill`, 12px thumb at 75% that grows on hover/focus; the generic input box styling (padding/border/background) no longer leaks onto it. |
| 4 | Loading/playback speed | The media pipeline (already tuned in D089) was not altered without real-account evidence. Rendering cost was cut: per-card `backdrop-filter` removed from the badge, duration, favorite and selection check (up to ~4 blur surfaces × every rendered card), and the dialog backdrop blur removed. Perceived start: delayed loader reveal (above). |
| 5 | Popups | Dialogs: no header separator, 16px radius, quieter border, 180ms open, lighter non-blurred backdrop, Korean `keep-all` wrapping. 파일명 dialog: 420px, the heading is a quiet label and the filename is the content. Media error card: 340px, solid surface, decorative warning disc removed. |
| 6 | Filename ⋯ | Glyph removed. Tapping a title that is actually clipped shows the full name; an unclipped title simply opens the file. Desktop hover shows the full name as a tooltip. |
| 7 | Title ↔ seek bar gap | Desktop chrome topbar 32→28px, seek row 32→22px (coarse pointers keep 44px), close button kept at 36px hit area with negative block margin. |
| 8 | Card play button etc. | Hover disc 44px, translucent, optically centred triangle, subtle scale-in; no dark wash over the thumbnail. Badges use tabular numbers instead of mono/letter-spaced bold. Liked cards keep a neutral disc with a pink filled heart. On touch, the favorite keeps a 44px target but draws a 30px disc. |
| 9 | Mobile ±10s | The bottom `+10S` capsule is gone. The existing (previously always transparent) side hint elements now show chevrons + seconds on the tapped side, accumulate on repeated taps in one direction (10초 → 20초), nudge once and fade in 650ms. |
| 10 | Hold 2× | Indicator is a small top-centre pill reading `2×`, away from the picture's centre and the bottom controls. All transient feedback shares that position. |

Verification: 943/943 Node tests (three new: badge visibility per state, seek-hint accumulation/side swap, unclipped title opens the file; the hold test now expects `2×`). `qa/mobile-hold-speed/audit.cjs` 19/19 native Chrome touch cases after the change (its committed D091 receipts were restored; new copies in `maintenance/tools/simple-ui-20261019/hold-audit`). Captures: no page errors or horizontal overflow in any state.

Limits: demo data and local MP4 in headless Chrome only; no real account, physical Android/iOS, WebKit or production run. Playback start latency was not measured.
