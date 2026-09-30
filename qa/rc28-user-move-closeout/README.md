# User move — exact safe savepoint

D-067 WAIT. `curate.cjs` only checks saved evidence, frozen source/file hashes,
existing package bytes and current public identity; it never executes browser,
device, product or network work. `manifest.json` enumerates exact owned paths,
bytes and SHA256 for force-staging ignored QA leaves. Include the manifest itself
without self-hash. Exclude private/raw outputs and ZIP bytes. QA byte attributes
preserve prior evidence. Metadata HEAD may differ from fixed public source944f.

Resume requires an explicit user instruction. The checkpoint and single-use
handoff retain all pending gates. No automatic timer or further unit is installed.
