# Actual disposable Drive mutation QA — 2026-09-28

Observed on authenticated user Chrome browser2/profile 내 Chrome, unchanged
candidate app/SW1.22.0-rc.10, product818712102d739eb68047913ad61e7afdae2cc0eb,
Worker85904e0a-ba28-4939-95d1-1375a626339b. Public app SHA256
43ba2889b349c29e35e6075600d09886089361cf40549b374ac3541cd0e5aedc matches source.
Productionv1.21.0, global writes=false and paused automation remain unchanged.

## Authority and actual scope

D-050 authorizes new uniquely marked disposable test files, move/trash/restore
and independent readback. D-051's private recoverable appData backup/new-writer
and device acceptance gates remain distinct. Enabling the global flag would also
enable automatic appData sync, so the real page's immutable false flag was kept.

The complete canonical mutation controller is byte-identically extracted into a
restricted QA closure with its own shadow state/storage prefix/true constant.
Only its transport can create or patch the three newly generated, privately
recorded IDs after independent tag/role/ownedByMe/MyDrive checks. Existing files,
folder PATCHs, appData, sharing, upload media and permanent DELETE are excluded.
Actual page account/auth/data/token-revision/SW/idle/settled-retirement owners,
lifecycle abort, streaming-body limits and request/deadline budgets are checked.
This is actual authenticated transport/controller evidence, not normal product
mutation UI or physical-device acceptance.

## Observed result

- The runner used35requests:27GET,3metadata POST,5PATCH. It created two private
  tagged folders and one empty text/plain file. The file moved A→B, went to Trash,
  was restored in B, moved B→A, then went to recoverable Trash. The two new folders
  remain in My Drive; they were never patched or trashed.
- The first real move response was deliberately suppressed after it arrived.
  Canonical independent GET confirmed its effect without a second PATCH. Four
  canonical rows confirmed with one attempt each; restoration used a separate
  guarded PATCH. This is injected response-loss evidence, not an observed natural
  network timeout or an interrupted browser recovery trial.
- Separate read-only recovery used4GET/0writes, verified all three identities,
  unknown0, and retained private recovery records. Independent final readback
  used6GET/1834bytes: all three final states, tags, ownership and versions were
  stable across two fresh passes. File version strictly equals its recorded final
  version. Both folders have advanced beyond creation versions but remain stable
  between fresh reads.
- Including two failed diagnostic reads, the bounded QA transports used39GET,
  3POST and5PATCH total. These counters do not cover whole-page/profile traffic.
  Planned/generated IDs and all raw metadata remain only in the browser's
  private `drive-original.qa.disposable.<uuid>.*` recovery namespace. No token is
  stored there. No private account/file ID or credential is exported in evidence.

## Counterevidence and corrections

The first final verifier failed after1GET because it compared current folder
versions against creation records. A separate1GET diagnostic found only version
different; identity, parents, MIME, tags and ownership matched. The failed exact
producer and diagnostic are retained. The corrected verifier keeps strict file
final-version equality and requires two stable fresh folder snapshots. Google's
[file resource contract](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)
defines version as increasing for every server change, including invisible ones.
The specific cause of these folder advances is unknown; child-file operations
are an inference. The successful frozen runner was not changed or replayed.

Immediate post-run account/cache/projection/writer equality passed. A later
coordinator check found viewed2added/1timestamp-changed, no favorite changes,
no baseline loss, and runtime/cache agreement. No QA item ID occurs in these
maps. The entire delta is not explained by current six-document remote read
cache. Originating action/writer/device is unknown, so whole-interval account
cache equality is explicitly false; ordinary remote merge is not asserted as
the cause. Account/controller/writer/readOnly/idle stayed equal at final checks.

Browser network events were truncated and retained no matching recovery bodies.
Fresh metadata GETs establish final state independently, not a complete network
trace. Synthetic guards do not establish all MUT-01~10 or normal UI acceptance.

## Evidence and recovery

`qa/v2-disposable-live/live-rc10-results.json` owns safe observed values and exact
producer hashes. Guard tests13/13 and separate final-verifier tests12/12 pass.
The exact executed browser expression SHA256 is
8543d23c6960b4678641a1a936512f71080713e8d5de3c57c7e3c613985a4f3e;
canonical extraction6a2ffe9bd7b2bf83110ff5af856515e8e6b0f5b57dd67251c6f47ac239a6b6bf;
corrected final verifier1d2e563687bfc80956677cbf943411257f4ad7040fd05f6cf01660ab6b62f938.
The safe result-view HTML/PNG is clearly a separate QA report, not a product UI
screenshot. Private object group/references were released and that temporary
report tab closed. Candidate tab remains a handoff for ongoing work.

Do not repeat creation as recovery, clear the private ledger, enable global
writes, or automatically trash retained folders. Recovery reads the exact ledger
namespace and independently verifies recorded identities without writing. Any
future cleanup must freshly inspect tags/ownership/descendants within authorized
scope; permanent deletion is not authorized. AppData migration/persistence,
fresh-origin/two-device acceptance and normal product mutation UI remain open.

D-055/D-056 preserve the user's deferred iPhone issue: the overlay-only touch
region must reveal controls without changing playback. Pause must continue to
leave controls hidden. No mobile product code was changed in this unit.
