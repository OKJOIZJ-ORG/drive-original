# V2-07A priority sample probe

This local-only, read-only probe reconnects the priority Drive sample's current
private identity to its actual container and track topology. It does not create
a derivative, upload media, mutate Drive, or claim browser/PWA playback.

The operator first reads the exact Drive file metadata, `files.version`, content
revision, checksum, parent and read capabilities. The CLI fingerprints the
already-local mirror, runs FFprobe, fingerprints it again, and checks stronger
file identity/stat fields around those serial reads. It also requires the
before/after Drive integer versions and fails if they differ. The operator then
reads the same Drive fields again and compares the private values.

FFprobe is configured with an 8 MiB `-probesize` analysis option, a 5-second
`-analyzeduration` option, and a 30-second child-process timeout. The first two
are stream-analysis budgets, not measurements or hard limits for total file I/O
or wall-clock time. The report therefore calls this a configured analysis and
keeps index presence, seek behavior, decode and product playback unverified.
The two full local fingerprint reads are explicit identity checks, not part of
a claimed bounded-byte probe.

Run the deterministic contract first:

```powershell
node --test qa/v2-07a-priority-probe/priority-probe.test.mjs
```

Then run the private probe without redirecting its output to a tracked file:

```powershell
node qa/v2-07a-priority-probe/priority-probe.mjs `
  --media <read-only-local-mirror> `
  --expect qa/player-stage-v2-01c/private-sample.json `
  --ffprobe <ffprobe.exe> `
  --drive-version-before <private-current-files.version> `
  --drive-version-after <private-current-files.version>
```

The emitted report contains no path, file ID, revision, checksum or media byte.
The current and historical `files.version` integers also remain private; the
report records only their before/after equality and whether the current value is
at or above the historical private baseline.
Keep the private expectation and any full provider response untracked. Only the
redacted evidence envelope belongs in `results.redacted.json`. The CLI output
uses the `...probe-output-redacted/2` schema; the committed envelope uses the
distinct `...probe-evidence-redacted/2` schema and names the exact probe-tool
commit that produced it.

For this sample, a Q1 label means only that the current fingerprint contains one
H.264 video and one AAC audio stream, no hidden extra stream, a sufficient
format-probe score, no unresolved HDR preservation requirement, and MPEG-TS
packaging while Drive metadata says MP4. Rotation and recognized HDR side-data
values remain explicit preservation inputs. PQ, HLG, BT.2020 high-bit-depth and
static or dynamic HDR side-data signals all keep a sample unverified until
preservation is proved. The label only says that the earlier
exact-fingerprint stream-copy experiment is relevant. It does not mean the
current product plays it, that iPhone/PWA was verified, or that every
MPEG-TS/H.264/AAC file has the same result.
