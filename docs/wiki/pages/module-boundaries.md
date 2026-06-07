---
title: "Module Boundaries"
summary: "Responsibility map for CLI, application, domain, and infrastructure, including the seams that keep tests and provider extensions predictable."
status: "reviewed"
evidence_paths:
  - "../evidence/modules/cli.md"
  - "../evidence/modules/application.md"
  - "../evidence/modules/domain.md"
  - "../evidence/modules/infrastructure.md"
source_paths:
  - "src/cli/transcription-cli-application.ts"
  - "src/cli/default-transcriber-binding-factory.ts"
  - "src/application/run-transcription-job-use-case.ts"
  - "src/application/run-batch-transcription-use-case.ts"
  - "src/infrastructure/storage/file-batch-index-writer.ts"
  - "src/domain/entities/job.ts"
  - "src/domain/ports/transcriber-binding.ts"
  - "src/infrastructure/storage/file-job-store.ts"
  - "src/infrastructure/media/ffmpeg-media-segmenter.ts"
  - "src/infrastructure/concurrency/task-pool.ts"
  - "src/shared/env-file.ts"
  - "src/wiki/application/code-wiki-service.ts"
  - "tests/unit/transcription-cli-application.test.ts"
  - "tests/unit/default-transcriber-binding-factory.test.ts"
  - "tests/unit/job.test.ts"
  - "tests/unit/task-pool.test.ts"
last_refined_on: "2026-06-06"
---
# Module Boundaries

## What It Covers

This page explains which layer owns each part of the transcription pipeline and which seams are meant to stay stable for tests and future provider additions.

## How It Works

- The CLI layer owns user-facing concerns: argument parsing, input-path normalization, `.env` loading, dependency construction, and help output. It is also where the default provider binding is selected.
- The application layer owns orchestration only. It computes the compatibility snapshot, initializes or resumes the job, drives the bounded task pool, triggers the final merge, and decides when cleanup happens.
- A thin batch boundary sits above single-file orchestration. `RunBatchTranscriptionUseCase` accepts N inputs, runs each through the same per-file use case behind a `RunTranscriptionJobExecutorLike` seam, bounds cross-file parallelism with `fileConcurrency`, and delegates index persistence to a `BatchIndexWriter` (`FileBatchIndexWriter`) — keeping fan-out concerns out of the single-file pipeline.
- The domain layer owns rules, not I/O. `Job` and `JobChunk` encode valid lifecycle transitions, resume reconciliation, and exit-code mapping, while the ports describe what external capabilities the workflow expects.
- The infrastructure layer owns concrete effects. `FileJobStore` persists typed records to disk through a serialized mutation queue, `FFmpegMediaSegmenter` shells out to `ffmpeg` and `ffprobe`, and provider adapters translate between SDK responses and the normalized domain contract.
- `TranscriberBinding` is the main seam between composition and execution. It lets the CLI choose a provider early while keeping real client creation lazy until the use case actually has pending chunks to process.
- The test suite leans on those seams directly. `createJobStore`, `createMediaSegmenter`, `createTranscriberBinding`, `createTranscriber`, and the task-pool worker contract make it possible to test orchestration without real network traffic.

## Evidence

- Evidence pages: [CLI Module Evidence](../evidence/modules/cli.md), [Application Module Evidence](../evidence/modules/application.md), [Domain Module Evidence](../evidence/modules/domain.md), [Infrastructure Module Evidence](../evidence/modules/infrastructure.md)
- Raw sources checked: `src/cli/transcription-cli-application.ts`, `src/cli/default-transcriber-binding-factory.ts`, `src/application/run-transcription-job-use-case.ts`, `src/domain/entities/job.ts`, `src/domain/ports/transcriber-binding.ts`, `src/infrastructure/storage/file-job-store.ts`, `src/infrastructure/media/ffmpeg-media-segmenter.ts`, `src/infrastructure/concurrency/task-pool.ts`, `src/shared/env-file.ts`, `src/wiki/application/code-wiki-service.ts`
- Verification spot-checks: `tests/unit/transcription-cli-application.test.ts`, `tests/unit/default-transcriber-binding-factory.test.ts`, `tests/unit/job.test.ts`, and `tests/unit/task-pool.test.ts`

## Open Questions

- Open documentation gap: this wiki does not yet have dedicated ownership pages for `src/wiki/` or `src/shared/`, even though both sit outside the main four-layer runtime pipeline.

## Related Pages

- [Architecture Overview](./architecture.md)
- [Provider Adapters](./provider-adapters.md)
- [Transcription Job Workflow](./transcription-job.md)
- [Resume Semantics](./resume-semantics.md)
- [Testing Strategy](./testing-strategy.md)
