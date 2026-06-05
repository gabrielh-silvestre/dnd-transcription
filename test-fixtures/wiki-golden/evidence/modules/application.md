---
title: "Application Module Evidence"
category: module
summary: "Observed orchestration steps and files for the application layer."
source_paths:
  - "src/application"
  - "src/infrastructure/concurrency/task-pool.ts"
---
# Application Module Evidence

This file is deterministic evidence for the application layer.

## Main use cases

- `RunTranscriptionJobUseCase`: full pipeline orchestration
- `MergeTranscriptsUseCase`: final markdown assembly from persisted chunk outputs

## Observed orchestration steps

1. Create a compatibility snapshot from the input file, provider, signature, and chunk duration.
2. Decide between new job bootstrap or `--resume`.
3. Segment media and hydrate pending chunks for new jobs.
4. Move the job into `running` when appropriate.
5. Execute pending chunks in the task pool with bounded concurrency.
6. Mark partial failure or merge into the final transcript on full success.
7. Optionally remove chunk artifacts on `cleanup-policy=on-success`.

## Why this layer is isolated

- It keeps orchestration out of the CLI.
- It prevents infrastructure from inventing workflow transitions on its own.
- It centralizes the difference between fatal errors and reusable partial failures.

## Relevant files

- `src/application/run-transcription-job-use-case.ts`
