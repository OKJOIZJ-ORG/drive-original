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

## Production (1.24.0, Worker 2e05bec1, user's signed-in Chrome, disposable files only)

A folder `drive-original-qa-20261104` with text files was created for this and nothing else. No user file was touched.

- First run failed (observed): the queue accepted 24 files, every Drive read failed and no file changed. Cause (assumed, not logged): `fetchImpl = fetch` called as `this.fetchImpl(...)` is `Illegal invocation` on Workers, and the fake Drive in the local checks hid it. A plain call plus a regression test fixed it; the third run below is the evidence.
- Second run stayed on the old code: the account Durable Object kept running the previous version while its alarm fired every 15 s. After the queue was cancelled and the object went idle, the new code loaded. **A deployment does not replace a busy queue's code until the object goes idle.**
- Third run: 72 files queued in 1.3 s and my tab closed at once. 48 trash confirmed by 12.7 s, 24 moves by 17.5 s, 0 failures, `lastFailure` null. Independent Drive listing right after showed 48 trashed. The tab used to check opened only after the queue had already been running. Rate: about 4 files per second. The user's own app tab stayed open and untouched; a page can only read status, so it did not drive the work.
- After the run the alarm went back to the credential retention deadline (about 30 days), so an empty queue costs no alarms.
- Settings panel on production listed the jobs with counts; no files stayed hidden.
- `lastFailure` and `alarmAt` in the status reply were added to diagnose this and stay.
- The QA folder was moved to the Drive trash afterwards. Drive removes it after 30 days.

## 1.24.1 undo (D144)

Demo Chrome 390×844: trash button sends with no dialog, the bar appears inside the viewport above the player buttons, undo restores the file and returns the player to it, the bar hides after 5 s. Selection move sends to the default folder with no dialog. Production result is below when recorded.

## Run it again

```bash
node qa/server-drive-jobs-20261104/workerd-check.mjs
```

Run from the repository root with `worker/node_modules` installed. It starts `wrangler dev` on port 18799.

## Not verified

- A real job of thousands of files, Drive's sustained write limit on this account, and the daily free row limit being reached.
- Phones and WebKit.
- CPU limit for Durable Object alarms on Workers Free (documentation is not plan-specific).
