# rc31 Android TS latency partition analysis

**Evidence:** safe actual result `actual-android-latency-partition-result.json`, SHA-256 `279874f857f25e8fbfa3b916697ee18c1f2a2a50cd4a4897da4a69e77d703dcc`. It records completed Android rc31 playback on immutable source `4a484e6f839d2e6c3eb83503acb08147362cb011`. The probe used native OS input, not human finger input. Original media and production were unchanged.

| Phase | Target frame | 15 s gate | Page-observed response-wait union | Request-wall union | Body-delivery union | Residual wall |
|---|---:|---|---:|---:|---:|---:|
| Startup | 13.757 s | Pass | 12.198 s (88.7%) | 12.396 s (90.1%) | 0.215 s (1.6%) | 1.361 s (9.9%) |
| Seek 50% | 19.462 s | Fail; later target frame observed | 18.178 s (93.4%) | 18.848 s (96.8%) | 0.811 s (4.2%) | 0.614 s (3.2%) |
| Seek 90% | 15.594 s | Fail by 0.594 s; later target frame observed | 14.204 s (91.1%) | 14.804 s (94.9%) | 0.714 s (4.6%) | 0.790 s (5.1%) |

Residual is unobserved wall time, never a CPU estimate. Unions prevent overlap double-counting. The replay duration and total cleanup passed, but the seek deadline failures remain failures.

The reducer's start-tagged records show repeated small metadata reads between page-visible media ranges:

| Phase | Completed metadata GETs (all 200) | In flight metadata at snapshot | Outer media requests (all 206) | Media wait sum, per request | Metadata wait sum, per request |
|---|---:|---:|---:|---:|---:|
| Startup | 10 | 1 | 4; 3 canceled | 6.816 s | 5.322 s |
| Seek 50% | 11 | 1 | 5; all 5 canceled | 10.143 s | 7.871 s |
| Seek 90% | 11 | 1 | 5; all 5 canceled | 8.118 s | 5.917 s |

Per-request sums may overlap and should not be added to each other or substituted for the union. Metadata median response waits were 0.536 s, 0.520 s, and 0.519 s respectively; maxima were 0.626 s, 1.588 s, and 0.646 s. Outer media response waits had medians 1.785 s, 1.688 s, and 1.629 s; maxima 2.056 s, 3.467 s, and 1.692 s. These media requests are same-origin `__drive_media` responses with `fromServiceWorker=true`; their wait is not an upstream Drive timing. All metadata events were direct Google API page requests (`fromServiceWorker=false`).

The phase window's `observedRequestCount` is 15/18/18 and includes any intervals overlapping the phase, including cross-boundary/in-flight requests. Start-tagged class counts above are not that union denominator. Network overflow was zero, but the observer covers page-visible target events only; SW upstream traffic, Q1 probe/parser CPU, worker inner CPU/ACK, clock calibration, and range offsets are unknown. The page reducer deliberately omits Range values. The recorded `ERR_ABORTED` events are retained cancellations; their purpose is not established by these timings. They do not negate the independently observed target frames.

**What the timing supports:** response waits dominate each measured interval. Metadata is frequent and individually slow enough to matter; outer media response waits are longer per request and may include unobserved SW/upstream work. The evidence does not isolate a CPU/parser bottleneck or establish a causal ranking between Google metadata service, SW work, and upstream range delivery.

**Earliest bounded optimization candidate:** first expose only safe numeric TS sample offsets/lengths and exact `source.read` counts in a local/frozen diagnostic, then test whether the 524,144-byte `probeTsSeek` windows overlap or nearly touch. `qa/v2-07b-ts-q1/ts-seek.mjs` caches identical `(start,length)` windows, but distinct overlapping windows are separate reads. If overlap exists, evaluate merging only when the combined range stays within `drive-source.mjs`'s 1 MiB read cap, then slice the admitted bytes back into the exact sampled windows. Preserve 188-byte alignment, probe/window/batch budgets, source/account/generation checks, exact Range validation, and each resulting read's preflight and postflight content fence. Do not assume a benefit: this safe result contains no range offsets, so overlap opportunity is presently unknown. Do not remove metadata fences or parallelize reads to improve the latency figure.

Source basis, all at rc31/4a: `app.js` lines 8397–8423 performs the 940-byte TS sniff and then opens playback; `media/drive-source.mjs` lines 145–148 opens metadata and lines 188–220 performs preflight/range/postflight for each read; `qa/v2-07b-ts-q1/ts-seek.mjs` line 17 defaults to 524,144-byte samples and its `sample` cache is exact-key; `media/ts-player.mjs` lines 171–178 already reuses admitted same-reader probe bytes for bootstrap. `partition-summary.cjs` explicitly labels residual as non-CPU. Seek `firstAppend`/`firstReady` at 0 ms are stale cumulative counters; excluded from this analysis.
