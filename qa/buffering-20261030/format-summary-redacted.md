# Media format prefix survey

Snapshot: done; inspected 12289/12289, uninspected 0.

Extension mismatches: 336; declared image/video family mismatches: 0; unknown signatures: 304.

## Actual prefix kinds

| Category | Count |
|---|---:|
| jpeg | 5281 |
| iso | 5146 |
| gif | 571 |
| webp | 485 |
| unknown | 304 |
| ts | 239 |
| png | 140 |
| quicktime | 60 |
| webm | 39 |
| heif | 24 |

## Extension / actual kind

| Category | Count |
|---|---:|
| mp4 → iso | 5125 |
| jpg → jpeg | 4946 |
| gif → gif | 561 |
| webp → webp | 478 |
| jpeg → jpeg | 298 |
| srt → unknown | 298 |
| mp4 → ts | 162 |
| png → png | 133 |
| mov → ts | 61 |
| mov → quicktime | 52 |
| webm → webm | 38 |
| png → jpeg | 32 |
| jpg → heif | 24 |
| m4a → iso | 16 |
| mkv → ts | 8 |
| mp4 → quicktime | 8 |
| webp → gif | 6 |
| mp4 → unknown | 6 |
| avi → ts | 5 |
| mov → iso | 5 |
| jpg → webp | 5 |
| jpg → png | 5 |
| jpg → gif | 4 |
| webp → jpeg | 3 |
| ts → ts | 2 |
| gif → png | 2 |
| png → webp | 2 |
| crswap → ts | 1 |
| gif → jpeg | 1 |
| bmp → jpeg | 1 |
| mp4 → webm | 1 |

## TS prefix metadata

| Category | Count |
|---|---:|
| strict-topology-compatible | 237 |
| strict-topology-unsupported | 2 |

## Mismatch reasons

| Category | Count |
|---|---:|
| extension-mp4-versus-ts | 162 |
| extension-mov-versus-ts | 61 |
| extension-png-versus-jpeg | 32 |
| extension-jpg-versus-heif | 24 |
| extension-mkv-versus-ts | 8 |
| extension-mp4-versus-quicktime-branded | 8 |
| extension-webp-versus-gif | 6 |
| extension-avi-versus-ts | 5 |
| extension-mov-versus-mp4-branded | 5 |
| extension-jpg-versus-webp | 5 |
| extension-jpg-versus-png | 5 |
| extension-jpg-versus-gif | 4 |
| extension-webp-versus-jpeg | 3 |
| extension-gif-versus-png | 2 |
| extension-png-versus-webp | 2 |
| extension-crswap-versus-ts | 1 |
| extension-gif-versus-jpeg | 1 |
| extension-bmp-versus-jpeg | 1 |
| extension-mp4-versus-webm | 1 |

## Evidence limits

- Finite prefix signature evidence only; container signatures do not prove codecs or all frames playable.
- TS headers are limited to 1024 bytes; missing/incomplete PSI is unknown, not unsupported.
- Strict topology compatibility is not strict player qualification; elementary data, clocks, seek and EOF remain unchecked.
- Unknown/error signatures and incomplete or unrecognized ftyp brand prefixes are not counted as mismatches. Generic ISO stays ambiguous; complete QuickTime-only and explicit MP41/MP42 brands can distinguish extension mismatches.
- Counts describe this snapshot and do not claim the unfinished survey covers the whole folder.
