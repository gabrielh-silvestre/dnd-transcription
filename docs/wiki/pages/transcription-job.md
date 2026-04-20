---
title: "Transcription Job Workflow"
summary: "End-to-end execution from CLI input through chunk segmentation, bounded transcription, final merge, and optional cleanup."
status: "reviewed"
evidence_paths:
  - "../evidence/workflows/transcription-job.md"
  - "../evidence/modules/application.md"
source_paths:
  - "README.md"
  - "src/cli/transcription-cli-application.ts"
  - "src/application/run-transcription-job-use-case.ts"
  - "src/application/merge-transcripts-use-case.ts"
  - "src/infrastructure/media/ffmpeg-media-segmenter.ts"
  - "src/infrastructure/storage/file-job-store.ts"
  - "tests/integration/transcription-orchestrator.test.ts"
last_refined_on: "2026-04-20"
---
# Transcription Job Workflow

## What It Covers

This page documents the main execution path for a transcription run, from argument parsing to `transcript.md`, including how partial failure and cleanup behave.

## How It Works

1. The CLI parses flags, resolves the effective input path, loads `.env`, constructs `JobStore`, `MediaSegmenter`, and `TranscriberBinding`, then passes normalized options into `RunTranscriptionJobUseCase`.
2. The use case computes a compatibility snapshot from the resolved input file, provider name, transcriber signature, and chunk duration. That snapshot is the gate for both fresh runs and `--resume`.
3. On a new job, the store initializes `job-state.json`, the job moves to `segmenting`, `FFmpegMediaSegmenter` probes total duration, emits WAV chunks in the canonical format, writes `manifest.json`, hydrates chunk state, and moves the job to `ready`.
4. On resume, the use case validates persisted artifacts and compatibility first. If the job is already `succeeded`, the workflow returns immediately instead of segmenting media or materializing a provider client again.
5. When pending chunks exist, the workflow creates the real transcriber lazily and processes only pending manifest entries through the bounded task pool. Each chunk is marked `running`, transcribed, written to `transcripts/<chunk>.md`, then marked `succeeded` or `failed`.
6. If any chunk remains failed, the job ends as `partial_failed` with exit code `2`. If every chunk succeeds, `MergeTranscriptsUseCase` reads persisted markdown files in manifest order and writes the consolidated `transcript.md`.
7. After full success, `cleanup-policy=on-success` removes the intermediate WAV chunk files. Fatal exceptions try to mark the job as `fatal_error` and return exit code `1`.

## Evidence

- Evidence pages: [Transcription Workflow Evidence](../evidence/workflows/transcription-job.md), [Application Module Evidence](../evidence/modules/application.md)
- Raw sources checked: `README.md`, `src/cli/transcription-cli-application.ts`, `src/application/run-transcription-job-use-case.ts`, `src/application/merge-transcripts-use-case.ts`, `src/infrastructure/media/ffmpeg-media-segmenter.ts`, `src/infrastructure/storage/file-job-store.ts`
- Verification spot-check: `tests/integration/transcription-orchestrator.test.ts` confirms ordered final merge output, reusable partial failure, resume retry of only failed chunks, and the no-op behavior for already-succeeded jobs.

## Open Questions

- Inference: the workflow assumes one active process owns a given output directory. `FileJobStore` serializes in-process mutations, but the repo does not document cross-process locking for two CLIs targeting the same job root at once.

## Related Pages

- [Architecture Overview](./architecture.md)
- [Module Boundaries](./module-boundaries.md)
- [Provider Adapters](./provider-adapters.md)
- [Resume Semantics](./resume-semantics.md)
- [Testing Strategy](./testing-strategy.md)
