# Drive Original 1.23.2 — historical delivery, superseded by 1.23.3

D084 follows1.23.1/maina5893dc with eight remaining improvements and three screenshot filename directives. Existing D083 same-origin release authority remains. Notion is excluded by D079; automation stays PAUSED; original media/backend/auth/security settings remain unchanged.

Public source `562d69c` corrects list pagination status and liveness/retry, image stage/control/card labels, touch-hover persistence, mobile refresh sizing, baseline library/control contrast and seek hit areas. Actual playback and track discovery implementations are unchanged.915/915 product checks pass, three isolated Chrome layouts pass, root directly reviewed final360px library and landscape player screenshots. Normal PC and actual Android operating-source checks passed; PC final corner inspection identified a further hit-area defect, corrected in1.23.3.

Immutable65-entry public ZIP/extracted assets equal Git blobs: `releases/Drive-Original-v1.23.2-562d69c.zip`, SHA256 `cc883be9b0c262403dec8798b4bc066377b35bd8a142b805ae71a5e724720eeb`. Bytes56,818,765. Private data/QA/backend files excluded. Reviewed mainf3e99b6 pushed; Worker dc04ba8a-3840-47e8-9122-05fefdf63451 deployed to the same origin. Five changed public responses match Git blobs, four private routes404. Package remains recoverable alongside1.23.1.

Final results and evidence boundaries: [RELEASE-1.23.3.md](RELEASE-1.23.3.md) and [qa/uiux-followup/README.md](../qa/uiux-followup/README.md). Android baseline six starts around3.2seconds and15-minute uninterrupted real1x playback passed. Historical45-second failure lacks failedState, so causeUNKNOWN remains. iOS belongs to user validation; full-duration/all-corpus/human-finger acceptance is not asserted.
