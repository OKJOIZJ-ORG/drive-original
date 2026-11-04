# Release 1.23.25 — D133 (D134 approved)

| Item | Value |
|---|---|
| Change | Move dialog lists and searches only top-level folders by default: direct children of My Drive, each shared drive root and its direct children. Settings checkbox "폴더 목록에 하위 폴더까지 포함" restores the D113 full listing and Drive server search |
| Commits | 5bfb0c8 feature, 70a144e release; main fast-forwarded and pushed |
| Worker | drive-original version 1bef4f37-eb58-4839-aa2b-a7ee39dcaa23 (`npm run deploy:release`, dry run first) |
| Tests | 1131/1131 (`node --test tests/*.test.js tests/*.test.mjs`); 3 new tests in tests/move-recent-search.test.js |
| Served bytes | 91/91 public files equal to Git HEAD 70a144e; 7 private paths 404; anonymous credential 403 (`served-check.cjs`, `served.json`); version.json 1.23.25 |

## Observed

- Local demo (chrome-ai, `?demo=1`): default list shows 내 드라이브 and the 2 top-level folders; the depth-2 folder is absent from the list and from search, with the "일치하는 최상위 폴더가 없습니다" note; a middle-of-name search matches. Ticking the checkbox stores the setting, clears the cached index, and the depth-2 folder then appears and is searchable. Unticking removes the stored value.
- Production signed-in normal Chrome, 1.23.25 under the service worker, `ensureFolderIndex()` called directly, read-only: 1,006 ms, 1 root + 6 top-level folders = 7 rows, 1 listing page, 4 Drive requests of 459–517 ms. The D114 full index on this account took about 150 s for 43,860 folders on 2026-10-26; the full index was not remeasured for this release.

## Not verified

- The production dialog UI with a real selected file: the account's top-level view holds no files, so the dialog was not opened there. No file was moved.
- Accounts with shared drives: the query is covered only by a fixture test; this account has none.
- Phones.

## Known limits

- Folders shared with the user and not added to My Drive have no top-level parent, so they are absent from the default list. Turn the setting on to reach them.
- A remembered recent folder stays in the list after its deletion until a move to it fails on the target metadata read, because the top-level index cannot prove it is gone.
- Tabs that were already open keep the old code until the normal app update is applied.
