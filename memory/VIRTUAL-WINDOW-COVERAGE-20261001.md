# Virtual window viewport coverage — local verified repair

Observed on actual candidate31: after playing later cards and returning to scrollY0, renderWindowStart remained36 (also18/78 on subsequent observations), so initial cards were absent. The old half-window hysteresis threshold suppressed the smaller return to0. Normal video-to-all filter reset restored the same observer-selected card without selecting another input.

The scheduler now checks the rows intersecting the viewport. An uncovered viewport moves the row-aligned capped range to include those rows; already covered scrolling retains the existing hysteresis. The240-card cap and existing render ownership remain unchanged. This fixes the responsible scheduler rather than increasing the mounted list.

Focused3/3 regressions cover stale top, covered scrolling, large jump, bottom and the cap. Root app/static integration170/170 and full product integration731/731 pass. The full suite used the prior730-check argument list with serial test concurrency and the one new viewport regression. No tests were skipped. Actual delivered browser verification is pending. Source31 served4a remains unchanged; this local repair is not yet delivered.

Whole D-066/D-068 acceptance continues. A passing local renderer check does not establish whole-corpus format playback, physical phone gestures or production release.
