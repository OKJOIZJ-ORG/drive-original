# V2-03B container-only remux probe

This local-only diagnostic answers one bounded question: when the exact source
has browser-decodable H.264/AAC tracks inside an MPEG-TS container, does a Q1
MP4 rewrap make the same media playable in Chrome without video or audio
re-encoding?

The source is read-only. The derivative must stay under an ignored `qa/*/`
directory, must never be uploaded to Drive, and must be removed after the
redacted evidence is complete. Do not substitute a transcode when stream copy
fails.

## Create the derivative

Probe the input first and enumerate every stream. The exact sample had one
video stream and one audio stream, so the validated command was equivalent to:

```powershell
ffmpeg -hide_banner -nostdin -n -i <read-only-source> `
  -map 0:v:0 -map 0:a:0 -map_metadata 0 -map_chapters 0 `
  -c:v copy -c:a copy -movflags +faststart <ignored-derived.mp4>
```

`-n` is mandatory overwrite protection. The FFmpeg mapping log must name both
streams and mark both `(copy)`. Confirm that the source length, modification
time and pre-recorded private SHA-256 fingerprint are unchanged afterward.

## Verify preservation

Compare input and output with FFprobe. The codec/profile, dimensions, pixel
format, frame rate, color description, sample rate, channel count/layout and
stream counts must remain the same. Container timestamps, whole-file hash,
bitstream packaging and MP4 default-disposition flags may differ, but every
difference must be recorded rather than silently called original-byte quality.

For this exact sample, compare decoded video-frame sequences and decoded PCM
windows away from the AAC priming/EOF boundaries at early, middle and near-end
positions. Hashes stay private; the redacted record keeps only the window
length, frame count and equality booleans.

## Chrome probe

Run the maintained same-origin Range server against only the ignored
derivative:

```powershell
node qa/v2-03b-container-remux/browser-probe-server.mjs `
  --media <ignored-derived.mp4> --port 8123
```

The command prints a new unguessable, run-scoped URL. Open that exact URL in
Chrome and activate the probe button. The server accepts only the actual
loopback host/port, and media/summary requests require the capability page's
same-origin referrer. Stop the process after the run; the capability then
expires. Passing
requires a finite duration and dimensions, a presented frame after seeks to the
first, middle and near-end positions, `readyState` 4 at those points, one
captured audio track when Chrome exposes `captureStream`, increasing decoded
audio bytes when Chromium exposes that counter, and valid 206 responses for the
browser's Range requests. A metadata event or moved seek bar without a
presented frame is not success.

The live result is in `results.redacted.json`. It establishes only the exact
sample on the recorded Windows Chrome build. It does not establish physical
iPhone/PWA support, a production derivative pipeline, every TS/H.264/AAC file,
or every format required by the integrated specification.
