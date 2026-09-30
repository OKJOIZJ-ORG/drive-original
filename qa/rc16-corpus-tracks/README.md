# rc.16 bounded corpus track preparation — 2026-09-30

Executable **local preparation only**. No actual-account/browser execution was
performed by this worker. Root owns actual execution, private provenance and
recovery. No product/public/version/global/original file was changed.

The established current-corpus, ISO-tracks, root-inventory and representative
leaves have no persisted private manifest/context/ISO selection JSON. Root also
confirmed a fresh actual candidate document has no prior in-page private corpus
handles. Its changing gallery counts are incomplete presentation snapshots,
not canonical inventory. Historical redacted4.6GB size/config fields do not
establish exact current ID/version. **Continuity is unknown.**

## Execute the exact generated expression

Build from canonical source:

```powershell
node qa/rc16-corpus-tracks/build.mjs
node --test qa/rc16-corpus-tracks/probe.test.mjs
```

`browser.generated.js` evaluates to a lexical function. It installs no window
globals, contains no private context, and returns an immediate opaque handle:

```javascript
start(privateContextText, swProof, privatePriorText = null, mode = 'probe')
// handle.poll(): safe progress / final safe summary only
// handle.cancel(): abort then poll until done/released
```

Root evaluates `sw-runtime-proof.expression.js` first and waits for its safe
`poll().accepted === true`. This is the existing activated-worker unique public
runtime-config/cache observation, pinned to rc.16 by exactly3 reviewed string
replacements; it performs1public GET and0media/metadata/writes. Pass its opaque
`get()`-capable handle, not the safe poll JSON. It fails after controller/version
replacement. Private context must be assembled and passed **inside the live
developer runtime**, never pasted into a tool prompt or exported:

```text
privateContextText JSON exact fields:
  accountKey: current Drive permission/account ID (state.accountId)
  generation: current state.driveSessionGeneration
  priorityFileId: canonical supplied priority object's current ID
  rootId: its independently confirmed canonical parent media-root ID
```

This preserves the existing `runAuthenticatedRootInventory` provenance contract:
the supplied priority must be a current direct child of that root and current
Drive `about.user.permissionId` must match. Do not infer root from whichever
gallery/folder happens to be open, or from a matching folder name. If root cannot
privately recover this proven context, this is the remaining **readiness blocker**;
do not substitute an arbitrary folder and call the corpus complete.

`mode='metadata-only'` performs the same bounded repeated inventory, selector and
final catalog comparison with **zero media**. Its `complete` refers to metadata
preparation and is explicitly identified by mode. Default `probe` runs selected
files in serial. A metadata-only preview is optional; do not reflexively spend
four extra inventory passes when the reviewed probe execution is already ready.

The optional `privatePriorText` is only for an actually retained private mapping:

```text
schema: drive-original.corpus-tracks-private-continuity/1
accountKey: exact current opaque authAccountKey
rootId: exact canonical root
rows: at most38 entries
  identity: accountKey,fileId,version,size,modifiedTime,mimeType,canDownload
  kind: whitelisted observed magic family
  tracksProven: boolean
```

It is matched to the fresh current representative identity on **all seven
fields**, including exact version; names and sizes alone never establish
continuity. Wrong account/root/schema is rejected. Known TS mappings are excluded;
exact proven ISO mappings are excluded without body reads. With no proven ISO
mapping, the current largest metadata ISO candidate is deferred without media,
and `deferredLargestIsoIdentityUnproven:true` is reported. That avoids repeating
the presumed old large sample while keeping the missing identity proof explicit.
No false exact-version exclusion claim is made.

## Owners and bounds

The wrapper reuses canonical root inventory/selector, `runBoundedProbe`, the
top-level ISO scanner, sparse-moov traversal and existing structural ISO parser.
No old source or its rc.11 version pin is edited. Existing reader/SW/auth owner
interfaces serve direct original bytes; no alternate bearer transport or fake Q1
generation is created. Same-origin generic SW reads retain actual account/session
numbers and omit sourceGeneration/mediaOwner requirements intended for active Q1.

- Before and after the sample batch, the canonical adapter builds a complete
  inventory with two matching passes, recursive folder traversal, pagination,
  shortcut/canonical priority and account checks. Final cross-inventory comparison
  is mandatory. Its whitelisted cause/count diagnostics reuse canonical private
  normalizers; raw differences never export.
- Metadata reconstruction keeps512total GETs,2MiB/response,64MiB total,25s/request
  and10min total run. Exact per-file metadata pre/post retains32KiB/response and
 10s deadline. Only official Drive v3 about/files GETs without `alt` are admitted.
- Plan caps are5ISO +1WebM +2metadata-directed unknown/image-MIME-risk objects,
 8total. Without retained magic mapping these are **current metadata-directed
  candidates**, not asserted to equal the old6ISO/1WebM/unknown2 rows. Priority
 and known TS are excluded; no36-prefix or15TS-continuation replay occurs.
- Per file:64media requests,2MiB+8192bytes,1MiB/request,50s lifetime,
 10s headers/body-no-progress and exact206/range/body/no-store validation. Whole
 object requests are refused; files<=940bytes skip body. Bounds are unchanged.
- ISO begins with one940-byte prefix and reuses it for header/nested reads. Sparse
 tables/config limits remain untouched. Unknown sample-entry layouts produce
 explicit `SPARSE_UNSUPPORTED_ENTRY`; they do not become corruption or absence.
- EBML validates VINT lengths/unknown size, parent/file bounds and≤56top headers;
 reads≤256KiB Tracks,≤32tracks/512nested elements. Segment may have unknown size;
 nested unknown sizes fail incomplete. Known-size Clusters are skipped by bounds.
 Header lookahead/prefix may include a few payload bytes; no cluster body/packet
 walk/cue decode is requested. CodecPrivate/track names/UIDs are skipped in memory
 and never exported. Only whitelisted codec names and numeric/boolean metadata
 leave the parser. Unknown-size Cluster before Tracks stays incomplete.
- The strict facade requires active exact rc.16 SW proof, authenticated same
 account/session/revision/credential, foreground/online, idle media, settled
 retirement, stable writer/revision, no pending state write and semantically equal
 state projection. Equal read refresh is allowed; changed projection/owner is not.
 Account abort/page hide/cancel stops work. Rejected or late-unsettled fetch/body
 cleanup is sticky terminal; no next file runs after such a reader failure.

Q2-fit and Q3-necessity remain separate. AVC/HEVC/AV1/AAC/AC3/EAC3 tags and bounded
header properties can select the next discriminator; this probe does not prove
parameter sets, actual channels beyond parsed headers, B-frame order, full color,
HDR/VFR/subtitles, decoding, playback, audibility or long-resource/device behavior.
The reused ISO parser refuses some unsupported tags/layouts rather than revealing
arbitrary raw FourCCs. Thus `unknown`/unsupported is an explicit incomplete result,
not evidence that MPEG4Part2 or Q3 need is absent. No conversion is invoked.

## Safe exported schema

`poll()` exposes started/done/phase and integer metadata/media/processed counters.
Final `summary` is `drive-original.rc16-corpus-tracks-summary/1`:

```text
version,scope,mode,complete,phase,failure
inventoryRuns,catalogStable,catalogComparison (safe code/booleans/counts)
metadataRequests,metadataBytes,mediaRequests,mediaBytes
plan: representatives,coverageComplete,priorPrivateMappingAvailable,continuity,
      exactProvenIsoExcluded,deferredLargestIsoIdentityUnproven,
      isoPlanned,webmPlanned,unknownPlanned,unknownSampleContinuity,
      all36PrefixesReplayed:false,knownTsContinuationReads:0
files: sample-N,group,kind,complete,failure,identityPreflight,identityPostflight,
       mediaRequests,mediaBytes,tracks (whitelisted structural metadata)
decoded:0,playback:0,physicalDevice:0,writeRequests:0
genericUpstreamCleanup:unknown,released
```

No ID/version/name/path/resource-key/account/token/raw configuration/image/audio
or provider-error string is part of this interface. Sample labels are run-local,
not durable corpus identities. `released` concerns local handle references;
generic upstream transport retirement remains unknown, as in the reused probe.
Root should save only this safe summary plus exact producer/source provenance.
Root owns clearing proof/runtime handles after final poll and retains any private
context needed for later exact-version mapping in its approved private store.

## Local verification and source grounding

15focused tests currently pass: plan caps/exclusions/unknown continuity, canonical
reader/sparse ISO plus EBML wrapper, redaction, content/owner/catalog changes,
metadata512/response ceilings, late cleanup, lexical build/facade, multi-MiB
Cluster skip and independent FFprobe agreement on generated VP9/Opus160x90 stereo
48kHz. The finite seed is synthetic only. `seed-oracle-results.json` records its
exact bytes/hash/toolchain/command and structural-vs-FFprobe fields; the fixture is
regenerable and excluded from curated savepoint. No browser QA was run here.

The first11/12test run used invalid synthetic ISO bytes appended outside mdat;
the real scanner correctly rejected the trailing invalid top-level header. The
fixture was corrected to put padding inside mdat. A later module-import check
caught that canonical normalizers are private exports; the standalone builder
now injects those exact lexical functions, as the established comparator does.
These were QA preparation errors, not actual-product or corpus findings.

New EBML work follows [RFC8794](https://www.rfc-editor.org/rfc/rfc8794.html) and the
[maintained Matroska schema](https://raw.githubusercontent.com/ietf-wg-cellar/matroska-specification/master/ebml_matroska.xml).
The modern-web-guidance background-fetch guide was searched/retrieved before
implementation; every owned read uses `priority:'low'` as a progressive scheduling
hint, with no dependence on priority support for bounds or correctness.

Root should stage only the explicit new leaf files listed in curated-savepoint.json;
no original/private/installed-toolchain or product path belongs to this unit.
