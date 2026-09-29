# Mediabunny Q1 source and license notice

Mediabunny 1.60.0, copyright (c) 2026-present Vanilagy and contributors, is distributed under MPL-2.0. The complete license is `mediabunny-q1.LICENSE`; upstream copyright and license headers remain in the preferred source and generated runtime notices.

The corresponding Source Code Form for this candidate is [mediabunny-q1-preferred-source.tgz](/licenses/mediabunny-q1-preferred-source.tgz). This candidate-relative download becomes available when the release owner includes it in the published candidate. Preparing this file has not published or deployed it.

- Source archive: 457,141 bytes, SHA-256 `0821f05c38e71f013662cb63e924b1a62bcb73c15eed4607c9ffc7429f97dea5`.
- Corresponding runtime: 686,739 bytes, SHA-256 `4ee8a826604206e169e4a7f9100cda1e4e54fadddf69f92df8ffa2b1bedd15cd`.

The archive includes all 66 upstream `src` files with the eight exact source modifications, all five required upstream `shared` files, the MPL-2.0 license, package metadata/tsconfig, patch and provenance, the preserved repository build producer, and a direct rebuild script. Its `SOURCE-MANIFEST.json` records every source/build input hash. Extract the package and run `node rebuild-source.cjs` on Windows x64 with Node.js and tar. It verifies the packaged inputs, obtains hash-pinned esbuild 0.25.1 (or verifies an `ESBUILD_BINARY` supplied by the builder), and requires byte-for-byte equality with the runtime hash above. No npm lifecycle scripts run. A separate extraction of this published-source candidate reproduced the tested runtime exactly.

This fork carries original DTS and decode durations, preserves absent versus declared color and exact SAR, and bounds the admitted streaming parser/mux ownership. Its source modifications are also provided in `mediabunny-q1-source.patch`; exact original/modified source hashes, upstream commit, source archive, required shared files, and build tool hashes are recorded in `mediabunny-q1-build.json`.

Preferred original source: https://registry.npmjs.org/mediabunny/-/mediabunny-1.60.0.tgz

Pinned upstream commit: https://github.com/Vanilagy/mediabunny/tree/359e4e4eee43bf968551e03ddc7280f9c69d655a

The repository build entry is `scripts/build-general-q1.cjs`. `node scripts/build-general-q1.cjs --check` reconstructs the preferred source from the pinned original archive plus patch and compares the built runtime with `media/mediabunny-q1.mjs`. The source-download entry rebuilds the already-patched complete source inside its archive, without downloading upstream source. Both use the same pinned build tool and flags.

The release owner owns candidate allowlists, source-download delivery and publication. Keep this source download available with its corresponding runtime. Updating the runtime or preferred-source inputs requires a matching source package and notice hashes; the historical QA fork is a separate artifact and is not this candidate's source package.
