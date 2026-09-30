# rc23 cold delivery diagnosis

Run: `node qa/rc23-cold-delivery-diagnosis/diagnose.cjs` from the canonical source repository.

Fixed source: `7591044adc1149391265b0e56a93a47252088a47`, version `1.22.0-rc.23`.
Expected deployed Worker identity supplied by the coordinator:
`1cb22ad7-f866-444a-9401-402187a37fc6` (not independently obtained by this browser probe).

`results.json` records a separate fresh anonymous headless Chrome context. The
original `qa/candidate-rc23-delivery/results.json` remains failed at its original
45-second controller wait and is preserved unchanged, with its SHA256 and the
original driver SHA256 recorded in this result. Its already-passing 52 public
Git-byte comparisons and six private 404 checks were not repeated.

The new probe preserves the nominal 45-second controller requirement. Only a
failure would permit at most 90 seconds of additional diagnostic observation;
late completion would still leave `passed:false`. No extra observation was
needed in this run. Before launch, available physical memory was 3713008 KiB and
virtual memory 2759648 KiB, exceeding the existing strict 1048576/1572864 KiB
floors.

Observed: DOMContentLoaded at 2781ms from probe start, installing worker and
empty shell cache at 4791/6791ms, then the correct version and controlled page at
6971ms. The worker activated, and the shell held 41 entries (root navigation plus
40 named assets). All 40 named cached assets matched fixed Git bytes exactly;
all eight source archives remained uncached. An offline reload in this owned
anonymous context retained the same version/controller, no account and disabled
candidate writes. There were no page errors or ServiceWorker error events.
Network-disconnected requests during the intentional offline phase are expected
network-first fallback attempts and are retained in the report, not classified
as online installation failures.

Conclusion: the original cold-shell timeout did not reproduce on this independent
run. Its original cause remains unknown because its report contains no worker
installation/network timeline. This success proves this fresh-run public shell
and offline cache, not the cause of the earlier failure, repeated reliability,
authenticated renewal, Drive media behavior or physical-device acceptance.

The producer retains registration/version lifecycle CDP events, timed snapshots,
public response statuses and sanitized request paths. Browser/context resources
were closed. No personal Chrome, Android, account, product file, server or
deployment was changed.
