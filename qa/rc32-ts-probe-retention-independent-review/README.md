# rc32 TS probe retention independent review

Observed local review on 2026-10-01 against `ae21f8ac6b34497b3690aef9bc67ecee86a7e927`, branch `codex/v2-kickoff-diagnostics`. Reviewed the scoped uncommitted `media/drive-source.mjs`, `media/ts-player.mjs` and `tests/q1-probe-retention.test.mjs` changes. Product files remained implementer-owned; this reviewer changed only this QA directory. No browser, device, network, protected-state or Git mutation was performed.

## Findings

One lifecycle gap was identified by code inspection: `clear()` changed the retained-slot epoch, and cached returns checked that epoch, but a fresh body originally stored a copy without checking the epoch captured before admission. A clear during a fresh preflight/body/postflight could therefore repopulate invalidated retention. The implementer added a store epoch fence captured before preflight. The independent preflight-clear check now passes: the current fresh read may return its separately admitted bytes, retains no copy, and a later fresh logical read can retain again.

No remaining material regression was found in the reviewed final diff. Fresh readers still open independently; every logical hit runs fresh preflight and postflight metadata/current-owner checks. Exact account generation/file/content/version/strong-checksum tuples are required. A null opening checksum cannot relabel previously retained bytes. Only exact packet-aligned head/tail ranges are retained; ordinary playback uses its fresh body. The two raw slots are bounded by 2 MiB, excluding separately owned per-read/parser/MSE data. No parser, bootstrap, worker, promise or MSE owner is reused across seek generations. Transport counters remain distinct from logical cached returns.

The player waits for prior disposal, retains already admitted raw probes across a normal seek, and clears retention for terminal errors, source replacement after the classified 503, and final disposal. Existing 188-byte alignment, GOP/audio parsing, 262144-byte playback reads, 65536-byte pushes, worker ACK behavior, window budgets and the once-per-player 503 budget were not modified.

## Independent checks

`node --test qa/rc32-ts-probe-retention-independent-review/retirement.test.mjs` passed **5/5**, exit 0:

- Aborted cold probe: ignored cancellation followed by a late response is canceled; no late retained bytes or logical completion.
- Account-generation mismatch: both prior slots are removed before admitting a fresh body under the new generation.
- Later unretained playback permission denial: clears source-associated raw probes and starts no Range transport.
- Clear during fresh preflight: invalidates in-flight retention, while later fresh reads can safely retain and hit.
- Final player disposal during a cold probe: no MSE creation, no admitted output/cache, settled source cleanup.

`git diff --check -- media/drive-source.mjs media/ts-player.mjs` passed. The implementer's focused suite and synchronous bootstrap/mux equivalence cases were inspected, not rerun by this reviewer. The full suite was not repeated.

## Reviewed byte identity

| Path | SHA-256 |
|---|---|
| `media/drive-source.mjs` | `CC625C3FD930A224E6EED7BD48FBD6D4B827F4C02CEED1F2409C9C6C85BF6C5A` |
| `media/ts-player.mjs` | `1A3E037464FA8BDCEF3A7831D78D20D256F14FCB404D80A3B5250F1907AC6705` |
| `tests/q1-probe-retention.test.mjs` | `AD1D96EC757DF4F56A0AEBFE0B4F0B1022C22000318FA5D97F8657777E819B4E` |
| `qa/rc32-ts-probe-retention-independent-review/retirement.test.mjs` | `9B63BFA48277FA192BEFEF1265431F0BCF9EBE9576C277D12E978F553A56D904` |

These are local evidence and reviewed byte identity. The 5 checks use synthetic provider data; the final disposal case uses an inert MSE constructor solely to discriminate premature creation. They do not prove native decode/presentation, Android acceptance, actual Drive request reduction, hosted rc32 delivery or the actual source31 failed seek meeting its 15-second bound. The real source31 repeated head/tail ranges and 9016.638-second failed seek supplied in the review brief motivate this change; actual candidate32 replay remains with the coordinator.
