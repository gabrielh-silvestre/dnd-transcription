<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-06-06 -->

# application

## Purpose
The application layer: use cases that encode the pipeline's business rules by orchestrating domain entities and ports. It owns the end-to-end flow — initialize/resume a job, segment media, transcribe chunks in parallel, reconcile partial failures, merge the transcript, and apply the cleanup policy — without touching infrastructure directly (everything goes through ports). It also includes the multi-input batch orchestrator (`RunBatchTranscriptionUseCase`) which fans out to per-file jobs with configurable `fileConcurrency` and aggregates results via a `BatchIndexWriter`.

## Key Files
| File | Description |
|------|-------------|
| `run-transcription-job-use-case.ts` | Primary single-file orchestrator. Inputs: CLI options + ports (`JobStore`, `MediaSegmenter`, `TranscriberBinding`, `Logger`). Flow: init or resume → build/validate compatibility snapshot → segment → transcribe pending chunks via the task pool → merge → cleanup. Returns exit code, job status, failed chunks, and final markdown path. |
| `run-batch-transcription-use-case.ts` | Multi-input orchestrator (`RunBatchTranscriptionUseCase`). Accepts N input paths, runs each as an independent job via a `RunTranscriptionJobExecutorLike`, controls inter-file parallelism with `fileConcurrency`, and writes a `batch-index.json` through a `BatchIndexWriter`. Exports types `BatchIndexEntry`, `BatchIndexWriter`, `RunBatchTranscriptionUseCaseInput`, `RunTranscriptionJobExecutorLike`. |
| `merge-transcripts-use-case.ts` | Subordinate use case. Reads manifest + job state, asserts **every** chunk succeeded, concatenates chunk markdown sections (`\n\n`-joined, trailing `\n`), writes the final markdown, returns its path. Throws if any chunk is missing/unsucceeded. |

## For AI Agents

### Working In This Directory
- **Resume safety**: `prepareResume()` must re-run `assertCompatibleSnapshot()` (input size/mtime/path, provider, transcriber signature, chunk duration). Any drift must abort, not silently re-transcribe.
- **All-or-nothing merge**: merge only proceeds when 100% of chunks succeeded; otherwise the job ends `partial_failed` (exit 2) and is retryable with `--resume`. Don't relax this.
- **Exit code derives from `Job.status`** (succeeded→0, partial_failed→2, else→1). Coordinate any change with the CLI.
- **State mutability gate**: state is only persisted after init/resume sets the mutable flag; errors before that leave the job retryable from scratch — preserve that ordering.
- A chunk failure records into job state but does **not** halt the task pool; the run completes with partial failure.

### Testing Requirements
Exercised heavily by `tests/integration/transcription-orchestrator.test.ts` (concurrency, retry, failure injection) and the CLI integration tests. Changes to retry/error handling break these immediately.

## Dependencies

### Internal
`src/domain/entities/{job,chunk-manifest}.ts`, `src/domain/ports/*`, `src/infrastructure/concurrency/task-pool.ts`, `src/infrastructure/storage/file-batch-index-writer.ts`, `src/shared/*` (logger, errors, paths). `run-batch-transcription-use-case.ts` depends on `run-transcription-job-use-case.ts` (via the executor interface).

### External
node `crypto` (`randomUUID`), `fs/promises` (`stat`), `path`.
