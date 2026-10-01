# rc29 passive observer: native slider gesture attribution

Prepared for fixed product source `10f1dd2ee9550866933e693dbf41c62e1fb2daad`, version `1.22.0-rc.29`. Only this NEW QA leaf was changed. Original rc29 preparation9-binding/11-contract sources and artifacts, rc25/28 templates, root's actual partial3-row result, product and canonical records are preserved. No actual user-browser/account/media/Drive probe, staging, commit or publication was performed by this task.

## Native counterexample and correction

Root reported first/warm Q0 startup success followed by `EXTRA_INPUT` on normal paused seek: its single trusted slider operation sends pointerdown, pointerup, then click. The frozen observer starts measurement at pointerdown and classifies its own follow-up click as a second input. This is an observer event-attribution failure; the retained actual row is not retrospectively turned into a codec/performance success.

The new observer holds at most one private gesture record. It consumes only one trusted matching down→up→click: same slider owner, pointerId/type, primary button0, original track ratio within0.002, unchanged account/controller/selected file/media session/source generation/player and a1000ms deadline from down. A real up is required; click detail must equal1. The record is cleared on consumption, saved outcome, clear/stop, pointer cancellation, visibility change, actual window blur, unrelated/wrong pointer movement, untrusted/hidden input or another pointerdown. Separate click/down, double click, wrong target/button/ratio/pointer, stale source or late click remains a failure and cannot be waived. There is no playback or network wrapper, source mutation, new request, timer budget, attempt reduction or timeout/p95 change.

Native local input exposed two necessary details: `click.isPrimary` defaults false even when its pointerdown/up are primary; it cannot be used to reject the already attributed final click. Also a capture listener on window sees descendant element blur during ordinary focus changes; only a blur whose target is window invalidates the pending gesture. Native input journals and retained failed candidates document both. The click-specific identity rule agrees with [W3C Pointer Events event attributes](https://www.w3.org/TR/pointerevents/#event-attributes). The modern guidance search yielded no relevant gesture guide; the primary event specification and native observations supplied the procedure.

## Evidence and limits

- `verify-gesture.cjs`:30 generated event-protocol cases pass. Frozen observer reproduces the original ordering failure; corrected mouse/touch/pen sequences pass with browser-style click isPrimary false and ordinary element focus transitions. Negative cases cover separate input, double click, wrong slider/pointer/type/button/ratio, missing/duplicate/untrusted up, hidden interval, cancellation, expiry, wrong movement, source/session/player/controller changes and actual window blur. A complete30-row sequence keeps20startup+10paused seeks and one simulated startup timeout; listeners/timers/frame callback and private selections release and output stays sanitized.
- Original `verify.cjs` remains byte-identical and its11 meaningful contracts were rerun against this changed observer: currentTime-only rejection, media/source errors, timeout, Q1/Q2 target/generation, close failure, failed/censored p95 and full30 sequence remain intact. Prior preparation11 were reuse evidence; these11 are newly executed against the changed observer.
- `verify-binding.cjs`:9 admission/rejection checks pass for exact29, old28 app/proof, hash/source mismatch, duplicate observer, controller drift and bad binder arguments; zero actual requests.
- `native-input.cjs`:3/3 exact-expression native Chrome input checks pass: trusted mouse and touch down/up/click produce one successful synthetic seek; a distinct second gesture remains `EXTRA_INPUT`. Native observer clear releases listeners/frame callback. Decoded frame callbacks/owners are explicit synthetic fixture values, not decoded-media or actual-account performance proof. Existing isolated Playwright is reused, all external requests aborted, SW blocked and unchanged memory launch floors enforced; browser closes in finally. The task's Chrome MCP first attempt had the root-managed profile lock; no shared or personal profile was altered.
- `native-mouse-primary-counterexample.json` and `native-mouse-focus-counterexample.json` preserve failed development candidates. The first contained both candidate mistakes; the second's instrumented journal isolates invalidation during native element focus blur. Final native records use the uninstrumented exact expression and retain its SHA256. No failed evidence was relabeled as a pass.

Local producers:

```powershell
node qa/rc29-performance-native-gesture/bind.cjs 10f1dd2ee9550866933e693dbf41c62e1fb2daad 1.22.0-rc.29
node qa/rc29-performance-native-gesture/verify-gesture.cjs
node qa/rc29-performance-native-gesture/verify.cjs
node qa/rc29-performance-native-gesture/verify-binding.cjs
node qa/rc29-performance-native-gesture/native-input.cjs
```

## Root installation and actual run

Retain/save the partial original result, clear its observer and delete `window.__rc25PerformanceQA`, close through normal UI, establish idle/settled retirement and the same current29 `window.__driveNightCorpus.proof` source/controller closure. Load this leaf's exact hashed local `observer.expression.js` once through the existing authorized bridge. Do not reuse an old28 proof or forge the proof.

API and schema remain `window.__rc25PerformanceQA.next()/read()/clear()` and `drive-original.rc25-performance-passive/1`. Use next's safe rendered-card rectangle, trusted normal first card click→read row→normal close+2s→same-card reopen→read row→normal pause→requested10/50/90% progress-track click→read seek row→normal close+2s. Repeat ten metadata-selected available unique files for exactly20startup+10seek attempts. An active attempt must settle or retain its failure/timeout before more input. Keep all failures and close failures. Final clear returns the bounded sanitized result and releases observation; it does not close the player. Save that result, then delete the API and run this leaf's unchanged `summarize.cjs` on it.

Original OBS03 targets remain Q0 cold first frame≈5s, valid-cache same-file warm resume≈2s, Q0 seek resume≈3s and20 representative repeats as a starting distribution. Failure-inclusive/infinite-censored nearest-rank p95 and each route/action/cache sample count remain. First/reopen labels stay `first-open-cache-unknown` / `same-file-reopen-cache-unknown`; seek stays `current-owner`. No Q1/Q2-specific budget, cold/warm proof, all2186 coverage, physical50 endurance, whole-goal or production acceptance is invented. Actual30-run evidence is owned by root and is still pending at this preparation.
