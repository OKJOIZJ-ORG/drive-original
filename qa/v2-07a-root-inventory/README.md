# V2-07A canonical-root metadata inventory

This QA unit inventories the canonical Drive parent captured privately from the
priority sample. It uses that exact ID; it does not search by name or path. The
inventory is read-only and metadata-only. It never requests media bodies,
thumbnails, exports, download URLs, checksums, permissions or owners.

Run the deterministic contract first:

```powershell
node --test `
  qa/v2-07a-root-inventory/root-inventory.test.mjs `
  qa/v2-07a-root-inventory/drive-browser-adapter.test.mjs
```

The inventory contract then does the following inside the authenticated HTTPS
candidate page:

1. Captures the private account permission ID as a fence.
2. Validates the supplied root as the same active folder with
   `canListChildren=true`.
3. Traverses only real parent edges, breadth first, exhausting every page token
   with `pageSize=1000`.
4. Restarts the whole pass once if Drive rejects a non-initial page token.
5. Resolves shortcut targets with metadata `files.get` calls only. Folder
   shortcuts are counted but never traversed.
6. Repeats the complete traversal and requires identical private normalized
   rows, the same account, and stable root metadata.
7. Emits only aggregate counts. Private rows stay in the candidate page long
   enough to choose later risk representatives and are never written to the
   tracked result.

Generate the temporary browser bundle from the reviewed source immediately
before authenticated execution:

```powershell
node qa/v2-07a-root-inventory/build-browser-bundle.mjs
node --check qa/v2-07a-root-inventory/private-browser-bundle.js
```

`private-browser-bundle.js` is a generated, ignored execution artifact. Inject
its exact bytes through the attached candidate tab's DevTools execution context,
then call `window.__driveOriginalRootInventory.runAuthenticatedRootInventory`
with the page's existing `driveFetch`, the privately captured account fence,
canonical root ID, and priority file ID. The runner re-reads the priority file
and requires that exact root in its current parents before any folder listing.
Keep the returned `privatePasses`
in a temporary page global; retrieve only `report` across the automation boundary.

The adapter requests these Drive fields:

- Account fence: `about.user.permissionId`.
- Root: ID, MIME, Drive ID, integer version, modified time, trash state and
  `canListChildren`.
- Entries and shortcut targets: ID and parent-edge fields, name/extension for
  private classification, MIME, decimal size string, modified time, integer
  version, selected read capabilities, video/image dimensions and duration or
  rotation, and shortcut target identity/resource key.

The tracked result distinguishes containment entries, unique classified objects,
visible media references and unique media objects. Shortcut-only media therefore
contributes to extension, MIME, size, capability and risk counts exactly once,
while multiple visible shortcuts remain multiple references. Decimal byte sizes
are handled with `BigInt` and serialized as strings.

Passing this inventory proves only that the canonical real-parent tree was
completely and repeatably observed during two non-transactional metadata passes.
It is not a provider snapshot, content checksum, container probe, decode,
current-product playback, or physical iPhone/PWA result.
