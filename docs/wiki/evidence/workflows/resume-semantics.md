---
title: "Resume Workflow Evidence"
category: workflow
summary: "Observed compatibility snapshot, retry behavior, and resume constraints."
source_paths:
  - "src/application/run-transcription-job-use-case.ts"
  - "src/domain/entities/job.ts"
  - "src/infrastructure/storage/file-job-store.ts"
---
# Resume Workflow Evidence

This file is deterministic evidence for resume semantics.

## Snapshot fields

- `resolvedInputPath`
- `inputSizeBytes`
- `inputMtimeMs`
- `provider`
- `transcriberSignature`
- `chunkDurationSeconds`

## Observed rules

- If artifacts already exist and `--resume` is absent, the CLI fails fast.
- If `--resume` is present without persisted artifacts, the CLI also fails fast.
- Jobs in `created`, `segmenting`, or `fatal_error` are not resumable.
- Chunks in `failed` return to `pending`.
- Chunks left in `running` without `finishedAt` also return to `pending`.
- Completed chunks remain skipped.

## Why this evidence matters

These checks prevent silently mixing different providers, prompts, endpoints, or chunking strategies into the same persisted job.
