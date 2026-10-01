# TS same-player bounded raw probe retention — local rc32

Observed Android31 passive-v2 transfers repeatedly read the exact same head and
tail intervals across seek generations. Startup14.604s/seek50 14.615s/seek90
16.638s are historical measurements, with the last15s gate failure retained.
This source change reuses only those already validated original raw intervals.
Actual rc32 speed, presentation and native/device playback are still untested.

Each TS player owns an opaque source-module WeakMap handle for at most two
packet-aligned boundary intervals, each at most1MiB and total at most2MiB.
Exact full account/content/version/knownSHA tuples are required. Every new reader
still opens with fresh metadata; every logical cache read still performs fresh
preflight and postflight checks, with the same owner, controller, account,
generation, permission, cancellation and deadline fences. Missing/changed
identity causes a fresh body or the existing denial. Nullable old checksum bytes
are never relabeled. Continuous/chosen-window/subrange reads stay fresh.

Only complete original bodies with unchanged pre/post state populate raw copies.
An epoch captured before preflight prevents an in-flight read from repopulating
cleared retention. Each seek waits for the old source/worker/MSE retirement and
creates fresh parser/pipeline state. Failure,503 replacement, account/content
drift and final disposal clear retention; the existing single503 player lifetime
budget remains. Transport counts/received/released bytes stay separate from
cache hit/returned logical byte counts. Slot ownership bounds do not prove a
complete JS heap bound or audible fidelity.

Reviewed final source hashes: drive-source
cc625c3fd930a224e6eed7bd48fbd6d4b827f4c02ceed1f2409c9c6c85bf6c5a;
ts-player1a3e037464fa8bdcef3a7831d78d20d256f14fcb404d80a3b5250f1907ac6705.
Focused49 checks passed, including canonical bootstrap/mux byte equivalence at
0/5/11.95s. Independent five additional owner/retirement checks passed after the
clear-during-fresh-store race was repaired. These use a Node MSE substitute;
native packet/frame/audio acceptance remains separate.

Root integration initially passed724 product plus14 audio lifecycle plus4 audio
admission checks. After version32 update the first full run had741/742 pass:
only the release static check still expected31. Updating that version owner gave
the final742/742 with no skips. Both first failure and final logs are retained in
qa/rc32-ts-probe-retention. Version owners app/index/sw/version and the static
version expectation are synchronized. Existing14368ca viewport coverage repair
is included in the later32 source cut, retaining row alignment and240card cap.

Delivery binder preparation pins rc31 predecessor and the same eight frozen29
templates. It rejects aliases/noncurrent sources before writes. No actual32
bind/deploy, production/main/push, original-media mutation, new grant or
automation change is claimed by this local record.
