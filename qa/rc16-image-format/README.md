# rc16 image-format qualification — 2026-09-30

Fixed source e57d7b5b3154a2a838d01f631cf71fa063044280. Product files unchanged.
Eight serial installed isolated Chrome synthetic-provider cases completed. Five
source/app/SW/public HTML/CSS/revision producers remain SHA-identical before/after.
Every displayed source is re-fetched through its pinned original URL and matches
its fixture SHA256 and byte length. The server serves local product bytes without
rewriting; remote non-provider origins are denied. No personal browser was used.
Chrome DevTools list_pages succeeded before using this owned maintained Playwright
isolated Chrome path. Chrome154.0.8037.58 observed.

Results.json/run.log own the exact raw8-case execution; painted-eight-driver.cjs
matches its recorded aff07f1b... driver SHA and reproduces that run. qualification.cjs
adds targeted case selection and failed-close evidence, with its own recorded SHA
in png-wrong-video-mime-results.json. This was the only additional product-path
case after the raw8 result; passing display cases were not repeated.

Native image presentation passes7/8: alpha PNG,4096x2048 PNG,BMP,animatedWebP,GIF,
PNG bytes advertised image/jpeg/disguised.jpg, and PNG bytes named disguised.mp4
but advertised image/png. Dimensions, decode/display, original byte identity,
alpha/native image canvas pixels, viewed only after load/decode + foreground
presentation, trusted Escape source/selection release, settled retirement and
same-file reopen are verified. The full original response is honestly labeled
original-sequential for native img GET; it is not a failed Range path.

Two animation oracles matter: canvas drawImage supplies an animation default
frame, so it is used for raster/alpha only; real rendered animation is sampled
through browser screenshot1x1 painted pixels. PNG reader first-row filters0..4
have zero predictor at the first pixel. Each sample retains its PNG SHA and
capture time. Viewer GIF/WebP show both expected exact red/blue frames over two
loops. WebP measured internal red218-220ms/blue778ms; GIF red217-309ms/blue713ms
against source250/750ms. Sampling resolution and partial initial/final intervals
prevent exact native frame-delay claims. Native original-byte delivery preserves
encoded timing; source Pillow decode oracles explicitly record250/750 and loop0.

Confirmed narrow defect: animatedWebP card is a native IMG and painted pixels
alternate red/blue; GIF card is canvas and remains red. MEDIA07 and QA-FM07 demand
both list-static/viewer-animated. The earliest reuse is createFileCard's existing
static GIF thumbnail branch: select it also for WebP and use WEBP placeholder
copy; registerStaticGifThumbnail already captures one native Image frame then
releases its source. isGifFile must not be globally widened because other callers
and labels are GIF-specific. proposed-webp-static-thumbnail.diff is only a proposal.
No product change has been made or authorized in this leaf.

Synthetic contradictory-metadata edge: PNG bytes declared video/mp4/disguised.mp4
use the declared video owner and fail instead of switching to the image viewer.
The exact raw display failure is failed/original-repackaged, image hidden/width0,
video visible, independent error panel, no iframe and viewedfalse. Targeted trusted
Escape then has selectednull,image/video source null,preview null,retirement
settledtrue and viewedfalse. It neither consumes history nor silently loads a
Google video iframe. TR04 content/MIME divergence and QA-FM08 wrong-MIME wording
make this a relevant boundary observation, but no real provider/corpus occurrence
was observed and no general MIME routing feature is inferred or implemented.
Wrong image subtype and wrong filename extension already succeed by native sniff.

Retained initial failures belong to QA: Range-only mode assertion rejected valid
original-sequential; canvas animation observer saw only default frame; screenshot
reader initially rejected valid first-row PNG filters. Initial animated WebP
producer optimized away transparent outside cropped frames; it is retained as
initial-animated.webp with producer manifest. Final producer uses an internal
transparent hole, independently decoded alpha0 in both animation frames. All
fixture files are synthetic Pillow12.3.0/libwebp1.6.0 outputs; exact current versions,
SHA, dimensions, frame delay, loop and pixel oracles are in fixture-producers.json.

The Windows per-case memory gate records FreePhysicalMemory>1GiB and
FreeVirtualMemory>1.5GiB; all gates pass. This is available virtual-memory evidence,
not a precise per-process peak or physical-device resource acceptance. Final host
read reports about3.93GiB physical and3.37GiB virtual available. No volume, account,
Drive original, global config, installed-profile, main/push/production or automation
changes. Physical devices, JPEG corpus, huge decompression bombs, all image profiles,
finite-loop variants and full image inventory remain unclaimed. QA-FM01/07/08 full
acceptance remains open; this leaf closes only its listed local native slices.
