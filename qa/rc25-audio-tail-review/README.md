# Independent bounded audio-only fragment review

Reviewer: gpt-6.1-sol high. No remaining confirmed material finding in the frozen three-path correction. No product, maintained test, shared memory, version, browser/device, account, network, deployment or commit operation was performed by this reviewer.

Reviewed SHA-256: media/general-player.mjs `adcbb532faa39ee4bb1f16effee908e2bdca50589ef890c2f27acc9e54572d1d`; tests/general-retention.test.mjs `669bb53ea8ea5f4d5111783ce156fd8683b60079962f81bfc4bb9e195a8e04b1`; media/general-README.md `68553e8d515db8c466f064b447c9136c691e252bd73b077bdcf410f8d4a8fac7`.

## Cause and responsible boundary

The saved Android107 record binds candidate25 source `7ba8e654fa38def8c8e00efcbf1600a4c8730c53` and old player `3d3820692114a3970e46a8ab3070df62bafa7a4f36d54b3e021a17e11833b3e7`. Its final observed fragment is116B, contains only init-identified audio track2/soun, tfhd flags131128/payload20, tfdtv1/decode645013504, trunv1 flags513/count4/payload28, and following3675B mdat. The prior fragment includes video1 and audio2. Failure is GENERAL_OUTPUT_FRAGMENT, with no native media error and stable owner. This supports the missing-video requirement as the local parser failure mechanism; it does not prove physical corrected completion.

The change in createGeneralRapIndex recognizes only one video and optional one audio track from this owned init. Non-vide/soun handlers, duplicate IDs/roles, unknown fragment IDs, empty/duplicate trafs, malformed tfhd/tfdt/trun extents, unsupported flags/version and zero/oversized sample count reject. Audio-only admission does not create a video RAP or change safe removal endpoints. Video-containing fragments keep sync/dependency flags, presentation-time/edit translation and monotonic RAP validation.

Every accepted moof requires a nonempty immediately following mdat. awaitingMdat is separate from pending video RAP, so audio-only EOF, another moof, partial header or incomplete mdat cannot claim completion. The observer sees bytes only after the actual page owner's successful updateend wait. RAP publication still occurs only after the complete mdat acknowledgement. This is a bounded owned-mux metadata observer, not validation of arbitrary external fragmented MP4 sample payloads.

Only the observer changed in the player. Account/content/owner/source-generation fences, canonical cancellation and retirement,8MiB batch admission,24MiB charged retention,8-second safe-RAP margin and ahead pressure remain in the existing owner. One <=262144B metadata body and bounded track/RAP sets are retained; mdat bodies are counted without copying them.

## Independent decisive check

`ack-error-discriminator.mjs` reuses only tiny maintained byte constructors, then drives the actual createGeneralPlayer with independent mock MSE/worker/provider owners. A valid audio-only final append starts, but a native error is injected before updateend. The final source-bound result passes: no EOS, GENERAL_MEDIA_ERROR, only the init/video appends acknowledged, worker terminated, blob revoked/source cleared, and cleanup settled. This tests the failure-vs-acknowledgement boundary beyond the author's successful append scenario. It is a local mock, not a native MSE/device proof.

Two QA-only first attempts are preserved with their exact producer bytes and honestly labeled observed tool output. The first reported40s ahead at currentTime0 and correctly hit unchanged ahead backpressure before the intended append. The second overconstrained idempotent source-abort calls to exactly one; the existing worker and page owners call it twice. Only those QA assumptions changed. No historical stdout file is invented and neither failure is relabeled as passed.

A second grounded potential regression was checked with the owned mux: a100s low-FPS GOP and4687AAC samples could exceed the newly applied audio-trun4096 bound. `long-gop-count-results.json` records GENERAL_MUX_RETAINED_LIMIT with settled cleanup before the observer. Existing GENERAL_LIMITS.retainedMuxSamples4096 already excludes that output, so this is not a newly introduced observer regression. The attempted counterexample remains failed evidence, not an accepted format or test pass.

The author reported24 focused checks passing; root supplied that report through coordination/tool evidence, without an archived raw log path. This reviewer read the maintained five new tests, including legitimate20s owned-mux output with audio endpoint19.9893s and a final audio-only fragment, but did not rerun the24 suite. Positive owned output, partial mdat/EOF, track/flags/count/extent negatives and the page-owner EOS/retirement assertions cover the changed contract. The independent ACK failure adds a different ordering.

## Reused prior evidence and limits

The existing rc24-general-retention-review binary-fields/results metadata is bound without rewriting or rerunning its12 cases. Its historical pass remains tied to old player3d382069; it is not represented as twelve fresh executions on adcbb532. Its edit-list/CTO/default flags/leaf-bound/RAP/credit checks remain relevant to unchanged portions reviewed in this diff.

No Android corrected long watch, corrected paused95% seek-to-end, native EOS or full420s completion is claimed. Root owns final integration/version/full Node checks and subsequent physical/native acceptance. This review covers this bounded parser/owner change only; it does not expand codec/container/corpus qualification, private account claims, production or all-device acceptance.

manifest.json curates exact safe new evidence files and binds the frozen product, saved Android counterexample and historical12-case metadata. Product and historical evidence stay read-only.
