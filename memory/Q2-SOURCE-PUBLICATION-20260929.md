# Q2 corresponding-source preparation — 2026-09-29

Local savepoint only. Production, candidate allowlists and `distributionReady` are unchanged by this unit.

The exact source-built AC3/EAC3 decoder has a corresponding-source/relink package of 53,597,911 bytes, SHA-256 `e596d3e61c8e8a2e816ebf9c735eada6bd24868a6aaf75e0610bf16889d44e64`, split into seven public assets no larger than 8MiB. The package contains 43 hash-bound materials: complete pinned FFmpeg/Emscripten/emsdk archives, original and modified MPL source, generated configuration, bridge source/object, static libraries, portable build/relink recipes and complete license notices. The large compiler installation/cache and private/QA media are excluded.

Supplied-object relinking and preferred bridge-source recompilation both reproduce the exact 502,740-byte WASM `48f85a683a94f6b35a21ce33c12a99312ac64e450eca4a9fffba36b5067e83bf` and original generated JavaScript. The existing 1,563-file SDK cache remains unchanged. The generated FFmpeg version string inherited the parent app Git description; source identity is independently pinned to FFmpeg n8.0 commit `140fd653aed8cad774f991ba083e2d01e86420c7`. This is same-toolchain relink/bridge proof, not a new complete cross-host build or device qualification.

Root reviewed the supplied full source, modification/relink rights, absence of GPL/nonfree configuration, retained copyright/notices and concrete object-based relink route against the [FFmpeg guidance](https://ffmpeg.org/legal.html) and [MPL source requirements](https://www.mozilla.org/en-US/MPL/2.0/FAQ/). The notice explicitly permits debugging modifications by reverse engineering and imposes no additional license restrictions. Technical source arrangement does not establish general patent clearance.

`qa/q2-audio-source-publication/curated-commit-manifest.json` selects the exact maintained paths. Root checks working and staged bytes against it. Source parts are excluded from service-worker precaching. Actual same-candidate public source URLs and matching runtime/notice delivery must pass before distribution readiness is asserted; application/audio end-window acceptance is a separate unit.
