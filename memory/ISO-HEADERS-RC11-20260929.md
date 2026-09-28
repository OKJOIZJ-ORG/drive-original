# First actual ISO top-level structure — 2026-09-29

The read-only rc.11 run passed its declared header-chain and catalog-stability
scope. The candidate remains b9d8739/app+SW1.22.0-rc.11/Workerfe556d43; no product,
original media, volume/output setting or production change was made.

## Actual result

- Maintained fresh repeated inventories and risk selection selected36 files.
  Private largest-category ordering found the first actual ISO after one routed
  object. Private IDs, names, offsets, source versions and body bytes were not
  exported or persisted.
- Three strict206 media GETs accepted956bytes: a940-byte head and16 additional
  sparse header bytes. The retained head served other header reads locally.
- Four logical header reads/32header bytes locate three declared top-level boxes:
  ftyp observed, one moov before the observed mdat, no styp/moof observed.
  The walker reaches the declared known-size end with codeEOF. It did not read the
  original's final byte or validate its complete payload.
- Per-file pre/post identity and final canonical catalog comparison hold;
  catalogStable=true/complete=true/failure=null/released=true. The successful
  comparator's diagnostic field is intentionally null; it is filled on drift,
  not a missing successful comparison or a zero-dimension measurement.
- Owned requests:126 metadata GET/22,775,004metadata bytes,3 media GET/956bytes,
  plus one separate public static-asset GET for runtime proof. Gallery background
  requests are excluded from these owned counts.
- Under an unchanged activated controller, a unique ordinary runtime-config.js
  response URL was written into exactly one versioned shell cache, rc.11. This
  observes the active runtime's cache writer; existing cached rc.11 files alone
  were not used as runtime-version proof.
- Job/private helper references and object group were cleared. The real player
  remains idle, no Q1, retirement settled; appData timers were not altered.

## Limits and reproducibility

This is one ISO top-level header chain, not brands/track/sample-table/codec parsing,
whole-container validity, decoder output, audible playback, seeks or device proof.
Catalog observations are repeated stability, not an atomic remote snapshot.
Native generic upstream cleanup and total browser memory remain unknown. The
independent PC audio-output blocker does not become a pass through this probe.
Full format/device acceptance and normal disposable UI are still distinct.

New QA leaf `qa/v2-07a-isobmff-rc11/` pins the exact executed bundle SHA256
`f9ce8cca157b352a9c9b117844137ce6be4288d5c25cb6a2eb849f2beeca9deb` and all producers.
Its meaningful local checks pass11/11, including selection38/39 boundaries,
pagination, strict Range/body length, split-header boundary, EOF guard, drift,
owner/write fences and held cancellation. Generated bundle syntax passes. Root
reviewed critical owner/Range/caps/cleanup paths and did not repeat passing checks.
`live-results.json` preserves actual safe summary, source hashes, scopes and counts.
Prior rc.10 probes/metadata drivers/results were not edited or overwritten.

Continue WP-10 fixed candidate qualification with explicit blocked acceptance
states. Production deployment remains a separate authority and acceptance gate;
queued cursor/overlay/loading/general UI work has not displaced this core unit.

Independent gpt-6-sol/medium scoped review found no material findings. It checked
owner/Range/caps/failure-stop/cleanup/bundle isolation and hashes, without rerunning
the11 passing producer checks or performing browser/Drive actions. `review.json`
pins this review scope and exact reviewed public producers.
