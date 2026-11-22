# scripts/

Maintained build, packaging and release tools. Each one says what it does in its header comment; this table says when it is used.

| Script | Used for |
|---|---|
| `app-scripts.cjs` | The page's classic scripts in load order; read by `index.html` checks, `sw.js` shell list and the test loader. |
| `public-files.cjs` | The public runtime and corresponding-source allowlist that every build reads. |
| `build-pages.cjs` | Builds the public shell into `_site/` (`npm run build:assets` in `worker/`). |
| `materialize-committed-pages.cjs` | Replaces `_site/` with the committed bytes before a deploy (`npm run build:committed-assets`). |
| `deploy-clean-worktree.cjs` | Production release from a detached clean worktree (`npm run deploy:release`, D106). |
| `pages-public-tree.cjs` | Public tree comparison used by `tests/pages-public-tree.test.js`. |
| `publish-pages.cjs` | Legacy GitHub Pages hand-off entrypoint, only after the Worker is verified. |
| `build-q1.cjs` | Rebuilds `media/q1-core.mjs` and `media/transmux-worker.mjs`. |
| `build-general-q1.cjs` | Rebuilds `media/mediabunny-q1.mjs` from the pinned MPL source (`--check` verifies). |
| `package-general-q1-source.cjs` | Packages the MPL Source Code Form of the general Q1 build (`licenses/`); see `media/mediabunny-q1-NOTICE.md`. `general-q1-source/` holds its rebuild helper. |
| `build-audio-compat.cjs` | Repackages the verified AC-3/E-AC-3 decoder into `media/audio-codec.*`. |
| `package-audio-source.cjs` | Packages the corresponding source of the audio decoder into `licenses/audio-source-*`. Run when the decoder build changes. |
| `link-video-q3.cjs` | Relinks the pinned Q3 video decoder into `media/video-q3-codec.*`. |
| `package-video-q3-source.cjs` | Packages the Q3 source and relink material into `licenses/`. Run when the Q3 build changes. |
