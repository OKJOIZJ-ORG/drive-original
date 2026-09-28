# Original format and seek unit — 2026-09-29

**Observed actual candidate:** fixed source `b9d8739`, app/SW rc.11, real-account
desktop Chrome. WebM original Range midpoint/resume/EOF/close pass. A 4.6GB AVC/AAC
MP4 presents before whole-object read, but its 50/90% seek recovery is a genuine
false failure. A passive native frame observation identifies delayed presentation
outside the old target window. Local seek repair is committed in `3fa5914`;
candidate replay remains separate.

**Observed actual failures:** declared MKV/AVI samples contain TS structures and
are rejected before decode. Bounded source jobs preserve metadata identity, read
two 524,144-byte windows and settle. The first has otherwise uniform 3003-tick
intervals with a 5-tick tail phase; the second uses rational 21fps 4285/4286-tick
intervals. This is evidence against the old global integer-CFR restriction, not
evidence of source damage. Earlier inference that two media reads implied head
clock admission is withdrawn.

**Implemented locally:** shared observed-timestamp validation retains strict
monotonic decode order, bounded reorder, nonoverlapping closed GOP presentation,
transport/configuration/identity/cancellation fences. Fragment validation checks
every mux DTS/PTS and binds its last duration to the next observed DTS. True EOF
duration remains explicitly inferred. No encoded payload, source timestamp or
audio track is rewritten. Canonical generated public bundles were rebuilt.

**Verified locally:** Astra ran Q1 133/133 and static 20/20. Independent ffprobe
timings, coded VCL/parameter/AAC equality, decoded frame hashes and PCM equality
pass for synthetic 5-tick phase, rational 21fps and VFR-boundary discriminants.
Root reviewed the clock/parser/mux fences. Preserved actual evidence validates
8/8; passing evidence validation does not erase actual candidate failures.

Evidence: `qa/v2-live-format-playback-rc11/README.md`, exact producers/results,
`qa/v2-07b-ts-q1/clock-extension.md`, `media/build.json`.

Next: fixed candidate integration and actual seek/MKV/AVI/priority replay, followed
by remaining existing combinations and state/UI/lifecycle acceptance. Physical
devices, full long-duration behavior, general remux/Q2/Q3 and final release remain
separate. No production, main/push, original media, grants or volume settings change.
