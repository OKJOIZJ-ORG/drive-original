# rc17 paused native seek follow-up — 2/2 cases and 6/6 seeks PASS

Two serial maintained synthetic-provider cases: native AAC/Q0 and AC3/Q2.
Each starts normal native decode, pauses through trusted Space, then uses the
trusted desktop seek slider at 10/50/90%. The target rVFC may arrive while seeking
is true; it is retained and joined with later native seeked, settled app/native
seeking, null watchdog and hidden loader. Current source-clock tolerance remains
0.25s for decoded target and 0.35s for settled currentTime. It does not require
another frame after pausing or infer display from currentTime/readyState alone.

qualification.cjs reuses native-retirement-smoke's unmodified-byte local server,
provider and original synthetic fixtures. Every runtime/public app/SW/HTML/CSS/
version/general/audio/mediabunny producer is SHA-pinned before/after. Before any
browser launch, QA_RC17_PIN must be supplied by root, HEAD must equal that exact
commit and every producer must equal git show for it. Installed Chrome starts
fresh per serial case; all external non-provider requests are rejected. Host
FreePhysicalMemory must exceed 1GiB and FreeVirtualMemory 1.5GiB before each case
and each seek. Trusted Escape must clear selection/source/callback/retained proof
and settle whole retirement.

Build via build-driver.cjs plus checks.txt. Executed after root GO against fixed rc17 commit 54654ce1efb2dbe0296a9641ed01182e9e1a8322 using Chrome 154.0.8037.58. Both serial cases and all six seeks passed. Producer maps were equal before/after and matched Git bytes. AAC 90% retained its decoded target while native/app seeking were true, then joined seeked settlement and hidden loader. AAC 50% also arrived while app seeking was true. All six remained paused with loader hidden after 200ms. Trusted Escape cleared selection, source, sampling callback and retained proof; retirement settled and both owned browsers closed. Minimum observed available physical/virtual memory remained above the configured gates. No unrelated D-056 rerun, Q1 synthetic, physical-device, account/audibility,
background or full-duration claim. Root actual TS evidence is separate and decisive.
