# Gesture reservation — rc.22 preparation

Observed on actual Android Chrome153/SM-X800/Android16: the first native movement in a repeated sequence was11.8 CSS pixels, below the existing12px axis intent. The next move became uncancelable and the gesture was cancelled. An isolated first16.7px move locked its axis and passed. The preserved16/17 attempts discriminate native contact ownership from a missing vertical handler.

The narrow fix reserves eligible media touchstart after existing edge,44px entry, preview, transition, multi-contact, cancelability and interactive-control guards. Intent thresholds, axis lock and navigation commit criteria remain unchanged. The actual native More summary was missing from the existing interactive exclusion; it is now excluded. Independent review reproduced the old summary being cancelled/misrouted and confirmed its correction plus D-056 pause without overlay.

Local qualification:18 focused gesture contracts; full629/629 stable Node product suites; actual Android renderer trusted8px→32px horizontal/vertical commits, browser two-contact cancellation and one touchend tap. The local fixture is synthetic and uses native tablet dimensions824×1191/DPR2.125. Its exact app SHA8f2c468b20300853d0b35249dc812385892ce5f12a3dfd30442aa6ab18654fd9 is the behavioral fix before the mechanical21→22 version pin. This is not hosted actual-account rc22 proof. The independent reviewer found no further material issue within this narrow scope.

Actual public21 device evidence retained: inspector-free OS Home34.107s hidden return;10/50/90% paused target frames; horizontal navigation; native two-pointer cancellation via official control-only scrcpy. Original21 upward failures remain and are not retrospectively promoted.

Evidence owners: `qa/rc21-android-night` (separate producers/results, including failed attempts), `qa/candidate-rc22-delivery/product-tests.json` (full fixed files and log hashes). Root integrates a fixed free candidate next, followed by Android native post-fix controls and repeated sequence. Public21/production1.21.0/main/push/automation are unchanged at this preparation point. Whole D-066 queue remains ACTIVE.
