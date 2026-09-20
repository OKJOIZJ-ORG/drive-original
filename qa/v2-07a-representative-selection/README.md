# V2-07A metadata risk representative selection

This pure selector consumes only the private, stable canonical-root inventory.
It performs no network request, body read, decode, file write or Drive mutation.
Raw IDs, versions, names, paths, MIME strings, visible references and shortcut
resource keys stay in the ignored private manifest held by the authenticated
candidate page.

Mandatory selection retains the exact priority sample/version, every MKV, AVI
and BMP object, every object at least 4 GiB, the largest MP4 and MOV, and the
longest video with known Drive duration metadata. A deterministic greedy cover
then fills observed extension, known MIME, media-family, MP4/MOV size, video
duration, GIF/WebP candidate, rotation, mismatch, capability and missing-metadata
categories. MP4/MOV large-size coverage begins at exactly 256 MiB. Reverse
pruning removes optional representatives that do not own a category. The result
is subset-minimal after the mandatory set; it does not claim a globally minimum
set cover. A visible shortcut without matching target metadata fails closed.

Run the contract:

```powershell
node --test qa/v2-07a-representative-selection/representative-selector.test.mjs
```

Generate the ignored browser bundle immediately before running it against the
private inventory already held by the authenticated candidate tab:

```powershell
node qa/v2-07a-representative-selection/build-browser-bundle.mjs
node --check qa/v2-07a-representative-selection/private-browser-bundle.js
```

Only the aggregate `report` may be tracked. `privateManifest` is the input to
the next bounded-probe unit and must stay private and ignored. Selection means
metadata coverage only. It does not establish actual animation, container,
codec/profile/bit-depth/HDR/track topology, Range behavior, decode, app playback
or physical-device playback. Those dimensions are added after bounded probes.
