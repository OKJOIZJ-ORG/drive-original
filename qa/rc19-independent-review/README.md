# rc.19 independent bounded review

Reviewer: gpt-6.1-sol high. Read-only product review; only this new review folder is owned by the reviewer.

Verdict: no confirmed material finding in the TS probe input reuse unit.

## Confirmed by source and scoped diff inspection

- `probeTsSeek` delivers input only after the existing probe admission succeeds. Its default `onInput=null` behavior retains the metadata-only plan and does not cache raw input bytes.
- The optional consumer runs synchronously. Throwing, returning an unexpected value, or returning a Promise terminates the probe. A returned Promise receives a rejection handler; probe-owned cached byte references are removed in `finally` on success and failure.
- Returned plans contain only the existing timing/topology metadata and copied SPS/PPS. Original TS windows are not added to the plan, player state, bootstrap statistics, or JSON diagnostics. Callback consumers can deliberately retain their delivered arrays; the product consumer does not do so.
- The player checks current ownership before and after synchronous bootstrap construction. It reuses input only when the original reader object still owns discovery. A classified 503 replacement prevents reuse and retains the original fresh head/window reads with the unchanged source pre/post fences and single player-lifetime recovery budget.
- Bootstrap construction still copies the bounded prefix and selected PES bindings. Probe bytes are not retained by the constructed owner; failed playback disposal aborts that owner. Retention by the probe remains bounded by the existing maximum 16 admitted windows of at most 1 MiB each and ends at probe exit. This is a source-level bound, not a measured browser heap limit.
- Target clamping, probe window admission, authenticated source checks, retirement, streaming reads, worker ownership, and packet transformation are unchanged. No network, authentication, worker, or codec dependency change is introduced.
- Generated core imports the same canonical source. The build manifest binds the changed source and generated output, and the unchanged compiler path preserves inline legal comments. No new licensing or corresponding-source dependency was introduced by this unit.

## Verification level and limits

The reviewer independently inspected the full changed functions, their bootstrap/source/disposal dependencies, and the maintained focused tests. A narrow read-only SHA/size check confirmed the changed generated core and source agree with `media/build.json`. No product files were edited, and no browser, network, real-account, focused-suite, or full-suite execution was repeated.

The implementation owner's reported 43 focused passes and ongoing isolated synthetic Chrome qualification are separate evidence. This review does not establish real Drive latency, physical-device behavior, or release acceptance.

Reviewed source bindings:

| File | SHA-256 | Bytes |
| --- | --- | ---: |
| `qa/v2-07b-ts-q1/ts-seek.mjs` | `6a382de8854f8bc517d244bcc98d9960d81386a7dc85f956724fa706d6ff7470` | 12660 |
| `media/ts-player.mjs` | `1ed49ec21f8dbb2dfc5e8d6190bb97867a7e142777bd197c519595305dd84661` | 17049 |
| `media/q1-core.mjs` | `7347d2b05e50f08501bee2e50ab7ed30e76f1dd653b0f9129bba6e0c047ccff8` | 51322 |
| `media/build.json` | `5ad86ae7455ca40e544b6e2b0cf584ae3dcfc437eb7aa95f353d5c9792d0343e` | 2987 |

The verdict applies to these bytes. Further product changes require a delta review.
