# Checkpoint — Drive-scale stability — 2026-08-23 21:00

## The story so far

Drive Original v1.13.8 has been fully inventoried against its Notion SSOT and a real `G:\` library of 9,788 supported media files. The active goal is to remove animated GIF thumbnail load, make folder moves cover all accessible Drive folders, make random/shorts use the complete folder population, and repair adjacent correctness/performance defects. No source patch has been applied yet; work is isolated on `codex/full-library-stability`.

## Decided

- D-029: GIF cards never run animated thumbnails; move search covers every accessible destination; random/shorts use the complete supported-media population.

## Waiting on the user

- None.

## Next first action

Create a deterministic test harness for pagination, bounded rendering, GIF card sources, folder catalogs, and random population selection before editing `app.js`.

## Tried

- Directly trusting `thumbnailLink` for GIF freezing was rejected as a guarantee because Google documents the link as unsuitable for direct web use due to CORS policy.
