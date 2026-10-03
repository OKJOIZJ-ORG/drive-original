# Drive Original1.22.1 — D078 production reflection — 2026-10-03

Observed: requested Safari playback and portrait-first UI/gesture fixes are integrated, pushed and published. The original specification's remaining actual acceptance remains open; this release does not relabel it complete.

| Owner | Published identity |
|---|---|
| Main integration/push | e4c963e517e5d259f53a6a290832a794477b7e3e |
| Immutable public runtime | d0bdde54fe007c5f8a3b2751edcf20f15911c02e |
| Worker | bf47cfd4-a626-43df-86f4-ab3d4a647ceb |
| Operating URL | https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/ |
| Public ZIP | releases/Drive-Original-v1.22.1-d0bdde5.zip;65entries;56,805,892B |
| ZIP SHA256 | 71c58c7573a50e8c0de8f53a4bb218e20d7cc6e522320816519d6adbb94c67a1 |

The [single QA owner](../qa/playback-repair/README.md) holds local source/test/gesture/layout/source-archive evidence and production receipts:65served assets,51cache entries,6private404s, anonymous401/no-store and controlled offline reload. Existing11Worker bindings and legacy Pages handoff remain; no duplicate deployment. Actual Safari1.22.1 normal update preserves login;13favorites load; two prior-risk MP4/MOV witnesses render60/83frames and seek exactly to midpoint. Portrait440x796 twelve44px targets have correct hit centers and viewport bounds. No temporary modules/CSS, original modification or all-video scan.

The versioned880run has879passes and one stale static version assertion, repaired with20static passes. This is adjudicated scoped success, not a freshly repeated880/880run. Earlier CSS/tap/oracle/tool failures and cleanup are retained in their owner. Materializer hardlink refusal remains intact; a fresh Git-blob package/assets directory was used without editing Drive sync aliases.

Physical finger/VoiceOver/audible output/native landscape menu scrolling remain unqualified. [Original acceptance matrix](RELEASE-1.22.0.md) keeps actualBMP, sustained actual-device Q2/Q3 resources, historical active-update condition and conditional formats separate. Current product truth and goal point to these limits. Automation remains PAUSED.

D079 cancels Notion release maintenance. The canonical “Drive Original — 유지보수” page was trashed and independently refetched with in_trash=true. Release records/packages remain in Git and workspace releases; no Notion attachment/readback gate applies. qa/playback-repair/notion-deletion.json owns the finite deletion and interrupted-upload cleanup evidence.
