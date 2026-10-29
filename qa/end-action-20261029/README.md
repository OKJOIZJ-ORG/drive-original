# D127 end-of-playback action (local)

Request: "파일재생이 끝까지 완료된 경우 자동으로 다시 처음부터 재생되거나, 다음 영상으로 넘어가거나, 랜덤쇼츠형식으로 넘어가거나, 멈춘그상태로유지하는 등의 옵션을 넣어줘. 기본값은 다시 처음부터 재생으로 해줘." (2026-10-29)

- Control: "끝나면 · 처음부터" in the PC player's more menu (`ctrlEndAction`) and the mobile ⋯ menu (`shortsEndActionBtn`, hidden on photos). Each press cycles 처음부터 → 다음 영상 → 랜덤 쇼츠 → 멈춤 and shows the choice briefly; it is remembered on this device (`localStorage` `drive-original.end-action`, default `repeat`).
- On the video `ended` event: 처음부터 seeks to 0 and plays (Q1 sources seek through their player with autoplay); 다음 영상 and 랜덤 쇼츠 use the existing next/random navigation; 멈춤 keeps the old behaviour.
- Tests: 3 new in `tests/app.test.js`; full suite 1044/1044 (an earlier run failed once on the known timing-based GIF thumbnail test, which passed 3/3 alone).
- Local Chrome (127.0.0.1:8765 demo, own tab; the demo has no real video, so `qa/faststart-h264-aac.mp4` was attached to the player as a blob): from 9.3 s, 처음부터 → `ended` then seek 0 and play, playing at 1.0 s; 멈춤 → paused and ended at 10 s; 다음 영상 → the next item (photo) opened; the choice survived in storage. `mobile-menu.png`: the 390×844 ⋯ menu.
- Not checked on real Drive sources (Q0/Q1/Q2/Q3), on devices, or in the deployed app. No version change, merge, push or deployment.
