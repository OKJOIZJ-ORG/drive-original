# Android and PC file readiness — 2026-09-30

Environment preparation only under D-064/D-065. No product/media/acceptance work.
Fixed candidate runtime1.22.0-rc.21/public source3ebd97d remains unchanged.

## Observed readiness

- One authorized Samsung SM-X800/Android16; Chrome153.0.8010.52. Human signed in
  and authorized USB debugging manually. `readiness-v3-result.json` records actual
  official Chrome DevTools MCP1.10.1 list/evaluate of the existing exact candidate:
  signed-in library visible, setup hidden, SW controlled, media hidden. Same-account
  PC/Android identity is not independently proved. FolderCount2 is page state,
  not a complete root inventory or account comparison.
- Human confirmed enabling PC extension file-URL access. `pc-file-access.json`
  records a real CUA filechooser in existing personal Chrome reading only the
  current local QA factory:147087bytes/exactSHA. Isolated input has no network
  upload handler; no factory execution. Temporary iframe/input removed.
- `preflight-connected.json` is the fresh22:39read-only preflight: PC tooling and
  device ready, Codexon0, existing memory floors pass. It binds the unchanged
  `qa/night-environment-20260930/preflight.cjs` hash. Readiness can drift; recheck
  at the explicit nighttime start.

## Preserved attempts and limits

| Producer | Result | Outcome |
|---|---|---|
| `readiness.cjs` | `readiness-result.json` | v1 wrongly assumed URL directly follows numeric page label |
| `readiness-v2.cjs` | `readiness-v2-result.json` | v2 assumed structured pages; actual MCP response has content only |
| `readiness-v3.cjs` | `readiness-v3-result.json` | title-aware content parser, actual candidate/login read passes |

These are harness assumptions, not product defects. Exact producer hashes are
bound in each result. `discovery-note.json` has safe device/browser metadata.
`curation.json` binds all curated files. No serials, unrelated tab URLs/titles,
account/Drive IDs, credentials, cookies or raw network bodies are retained.

Each producer creates only its own ephemeral ADB forward and official MCP client
using cached existing packages, then cleans both up. No global config changes.
Before any later recheck, copy v3 to a new named attempt and change its output
filename, preserving all historical result bytes. Do not rerun into old results.

PC file proof records exact Runtime expressions and action sequence; it is a
readiness journal, not a runnable corpus factory result. Agent changed no
security setting or OAuth grant. No playback, gesture or OS-return proof is
inferred. Older17:13preflight deviceReady=false remains historical. Continue
product work only after the human's explicit nighttime start.
