# D126 subfolder and folder loading (local)

Request: "하위폴더 추가해서 탐색할때 기존에 로딩된걸 또 탐색하는 식의 비효율적 로딩 방식을 개선하고 전반적으로 최대한 최적화되고 개선된 로딩으로 패치해줘." (2026-10-29)

## Causes found in the code (observed)

1. Every subfolder choice re-listed the current folder from page 1 (`folder.id === root.id` was always listed) and re-fetched its metadata, even when an earlier scan or the ordinary listing already had it.
2. The ordinary listing's loaded pages were thrown away when subfolders were turned on.
3. A folder the choice only passes through (Y to reach Y/X) was listed with all of its media, although the picker already knew its subfolders.
4. The scan waited for a whole depth before starting the next one.
5. Turning subfolders off, or re-entering a folder already read, listed it again.
6. The picker asked Drive for the current folder's subfolders although the ordinary listing (folders first) already had them.

## Changes

- A tree-cache entry is never listed again until Refresh (which already drops the cache); complete ordinary listings join the cache (`rememberCompleteFolderListing`), and a folder read completely opens from it (`showCachedFolderListing`).
- Turning on subfolders hands the ordinary listing's pages to the scan, which continues from its next page token with the same query (`deepScanListingSeed`); a folder with seeded items needs no metadata GET.
- Pass-through folders use the picker's subfolder list (`childListedIds` coverage: included folders need a full listing, pass-through folders only their subfolders).
- A pool (8 at a time, was 4 per depth) starts each subfolder as soon as its parent page holds media (folders come first in `orderBy: folder,…`); a folder arriving after media is still listed. Items are assembled breadth first, so results do not depend on response order.
- The picker reads the current folder's subfolders from the ordinary listing once a media item has arrived.

## Evidence

- `node --test tests/*.test.js tests/*.test.mjs`: 1041/1041 (7 new in `tests/subfolder-selection.test.js`; the old "root listed again" expectation now expects no re-listing).
- `bench.cjs` simulates Drive with 850 ms per request (D100 measured ~0.85 s TTFB) on one scenario: open a 2052-file folder, pick Y/X, add Z (3 levels), choose all, turn off, open Z and come back. Before (`bench-before.json`, app at 9fc92a4): 25 requests, 21.55 s. After (`bench-after.json`): 10 requests, 6.96 s. Simulated, not measured on the real Drive or a signed-in account.

## Limits

- Cached folders do not show files added elsewhere until Refresh (as subfolder scans already behaved under D119).
- Not checked in the deployed app or against the real Drive; no version change, merge, push or deployment.
