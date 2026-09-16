# Checkpoint — v1.15.0 commercial-grade stabilization released — 2026-09-16 18:12

## The story so far

Drive Original v1.15.0 is released from commit `b813a15d29b97915b01b553dd758218e5451de86`. GitHub Pages run `35077604373` completed successfully, and live `version.json`, `app.js`, `styles.css`, `sw.js`, and `index.html` returned HTTP 200 with bytes equal to that commit. Both release ZIPs are 103,841 bytes with SHA-256 `8D87B29890DF0284CF95E003955D74E9E369BC906A96A298D39144EBED621059`. The Notion maintenance page was updated and re-fetched with the same version, commit, run, package, architecture, and verification boundaries.

## Decided

- D-031 and D-032 are the current governing decisions.
- Request-scoped token recovery and no-store Range streaming remain the security/performance contract; non-reusable speculative media bodies stay disabled.
- Physical iOS Safari and authenticated Google-account behavior remain explicit verification boundaries, not inferred successes.

## Waiting on the user

- None.

## Next first action

No required release work remains. If a real-account or physical-iPhone regression is reported, reproduce it against v1.15.0 without weakening token isolation or reintroducing full-file video buffering.

## Tried

- Chrome mobile emulation found three genuine accessibility issues: zoom was disabled, metadata contrast was 2.48:1, and custom accessible names omitted visible labels. After correction, Lighthouse accessibility improved from 91 to 100.
- An authentication regression test exposed a same-tick `clearToken()` race; clearing the old single-flight reference fixed it and the new test passes.
- Browser screenshot file export to a new local artifacts path was denied by the browser tool; inline screenshots and DOM/computed-style readback completed the visual check.
- The final independent audit found a 512KB body prefetch whose `no-store` response could not be reused. It was removed before the release commit, and a static regression assertion now forbids its return.
