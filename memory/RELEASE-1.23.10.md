# Drive Original 1.23.10 — operating delivery — 2026-10-19

D099 root-cause fixes delivered: main 02d925b→b4c27e2 pushed; same Worker, version 02b55d4c-a8c3-4578-9be3-5610335a2ef1. The Q3 codec's committed/served bytes now equal the license manifest (`-text`). The materializer waits out the Google Drive for desktop upload hard link (and only that condition). Q3 passes Q1_SOURCE/Q1_EXACT causes through, and its source package was regenerated.

Evidence: 947/947 tests; the unmodified deploy:candidate succeeded through four Drive-link waits; 65/65 served files Git-equal; bindings/secrets unchanged; auth correct; actual signed-in Chrome on v1.23.10 with 20 likes and playback. `qa/release-1.23.10/README.md` owns details. UNKNOWN: production Q3 transcode of a real MPEG-4 Part 2 file, physical devices, WebKit, fresh OAuth consent.
