---
title: "Infrastructure Module Evidence"
category: module
summary: "Observed side-effect boundaries, design choices, and file inventory for infrastructure."
source_paths:
  - "src/infrastructure"
  - "src/shared/process.ts"
  - "src/shared/logger.ts"
---
# Infrastructure Module Evidence

This file is deterministic evidence for the infrastructure layer.

## Main areas

- **storage**: `FileJobStore` plus typed persistence records and mappers
- **media**: `FFmpegMediaSegmenter` and `ffprobe` wrappers
- **concurrency**: bounded task pool for chunk execution
- **providers**: fake/OpenAI adapters and configuration helpers

## Observed design choices

- `FileJobStore` serializes mutations through a queue so concurrent chunk completions do not corrupt `job-state.json`.
- Records and mappers isolate on-disk schema from in-memory objects.
- Media normalization happens before provider upload.
- Provider configuration stays outside the application use case.

## Relevant files

- `src/infrastructure/providers/fake-transcriber.ts`
- `src/infrastructure/storage/file-job-store.ts`
