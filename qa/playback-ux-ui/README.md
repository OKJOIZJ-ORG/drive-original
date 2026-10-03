# Playback and library layout receipt

Run `node qa/playback-ux-ui/audit.cjs after` from the source root. `before` renders
the fixed pre-repair `f495163` app, HTML, and stylesheet for comparison. Each run
captures its app/HTML/CSS bytes at startup and records their SHA-256 hashes.

The isolated Chrome profile blocks external requests and service workers. The
actual app renders a synthetic catalog and poster. The driver checks PC 1920 and
1440, portrait 440/390/360/320, and touch landscape 667/844. It exercises native
Chrome long press selection, equal icon proportions, 44px mobile targets,
selection control overlap, viewport/menu boundaries, and a 34px bottom safe area.

Screenshots and `results.json` belong to `before/` and `after/`. This proves local
DOM layout with synthetic media, not account playback, physical iPhone behavior,
or deployed bytes. Compare source hashes before reusing a receipt after changes.
