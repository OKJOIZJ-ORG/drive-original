# Server trash/move queue (D139), player buttons (D140), random (D141), duration sort (D142)

Release 1.24.0, approved by D143.

## What changed

- `worker/drive-jobs.mjs`: trash and move queue in the account Durable Object's SQLite, driven by alarms. The page can close.
- `app/drive-jobs.js`: submits file IDs in chunks of 400, follows progress while the page is visible, adopts jobs started before a reload or on another device.
- Settings "파일 작업" replaces the floating status. Player trash and move buttons are always out; move is quick move by default.
- Random uses `crypto.getRandomValues`; shorts order is unseen, watched earlier, shown this session.

## Evidence

| Check | Result | Limit |
| --- | --- | --- |
| `tests/drive-jobs.test.mjs` | 19 tests on real SQLite (`node:sqlite`) with a fake Drive | Not Cloudflare's SQLite API |
| `workerd-check.mjs` in local `wrangler dev` | `DriveJobOwner` in real workerd: 60 files confirmed, 60 PATCHes, 4 alarms, at most 46 Drive calls per alarm | Fake Drive; alarm wiring here is the check's own, not `AuthObject` |
| `tests/background-drive-actions.test.js` | Page side with a fake server: submit, settle, adopt after reload, chunks, quick move, position uniformity over 60,000 shuffles, no repeat while unseen files remain | Simulated |
| Demo Chrome 1440×900 and 390×844 | Move button sends without a dialog and advances, settings toggle, folder pick, buttons inside the viewport, no horizontal overflow | Demo mode has no server queue |

Production results are added below after deployment.

## Run it again

```bash
node qa/server-drive-jobs-20261104/workerd-check.mjs
```

Run from the repository root with `worker/node_modules` installed. It starts `wrangler dev` on port 18799.

## Not verified

- A real job of thousands of files, Drive's sustained write limit on this account, and the daily free row limit being reached.
- Phones and WebKit.
- CPU limit for Durable Object alarms on Workers Free (documentation is not plan-specific).
