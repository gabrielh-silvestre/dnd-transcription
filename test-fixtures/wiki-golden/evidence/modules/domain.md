---
title: "Domain Module Evidence"
category: module
summary: "Observed job lifecycle concepts, invariants, and domain file inventory."
source_paths:
  - "src/domain"
  - "src/shared/errors.ts"
  - "src/shared/paths.ts"
---
# Domain Module Evidence

This file is deterministic evidence for the domain layer.

## Main concepts

- `Job`: aggregate that owns job status transitions, compatibility checks, and exit code derivation.
- `JobChunk`: per-chunk lifecycle state.
- `ChunkManifest`: persisted chunk ordering and timing.
- Ports:
  - `JobStore`
  - `MediaSegmenter`
  - `Transcriber`
  - `TranscriberBinding`

## Observed invariants

- job-state version stays at `1`
- only valid status transitions are allowed
- resume compares `resolvedInputPath`, size, mtime, provider, signature, and chunk duration
- chunk failure remains reusable via `partial_failed`
- `succeeded` returns exit code `0`, `partial_failed` returns `2`, everything else returns `1`

## Relevant files

- `src/domain/entities/job.ts`
