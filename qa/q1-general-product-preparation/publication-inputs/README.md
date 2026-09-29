# Corresponding Source Code Form: Mediabunny Q1

This package contains the complete patched Mediabunny 1.60.0 `src` tree, all five
required upstream `shared` TypeScript files, MPL-2.0 license, exact patch and
provenance manifest, original repository build producer, and a direct source
rebuild entry. Source and build input hashes are listed in SOURCE-MANIFEST.json.
The tested runtime hash is recorded there; compiled runtime and SDK caches are
not duplicated in this source download.

On Windows x64 with Node.js and the system tar utility:

    node rebuild-source.cjs

The command verifies every packaged source/build input, retrieves only the
hash-pinned esbuild 0.25.1 tool, builds package/src/index.ts and requires byte-for-
byte equality with the tested runtime SHA-256. An existing tool may be supplied
through ESBUILD_BINARY; its exact binary hash is verified too. No npm lifecycle
scripts run. The resulting file and report are under rebuild/.

The preserved original producer is scripts/build-general-q1.cjs. In the parent
repository it rebuilds from the hash-pinned npm archive and source patch. Its
--check mode compares against the repository's media/mediabunny-q1.mjs. The direct
entry above instead rebuilds the complete preferred source included here, so
reproduction needs no upstream source download. Both use the same esbuild binary
and command flags. Node and tar are host prerequisites; their executable binaries
are not part of this source package.

Upstream npm source:
https://registry.npmjs.org/mediabunny/-/mediabunny-1.60.0.tgz

Pinned upstream commit (also supplies the five shared files omitted by npm):
https://github.com/Vanilagy/mediabunny/tree/359e4e4eee43bf968551e03ddc7280f9c69d655a

Copyright (c) 2026-present Vanilagy and contributors. MPL-2.0 terms and notices
remain in package/LICENSE, media/mediabunny-q1.LICENSE and individual source
headers. Modifications carry original DTS/decode duration, color declaration
presence, exact SAR, and bounded streaming ownership. This is source availability
for a particular tested runtime; it does not broaden the runtime's admitted
containers/codecs or assert native RGB equivalence.
