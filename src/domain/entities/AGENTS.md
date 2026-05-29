<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-05-28 -->

# entities

## Purpose
The domain model — strongly-typed aggregates and value objects that enforce the pipeline's invariants with pure logic (no I/O). `Job` is the root aggregate owning the chunk collection, status transitions, exit-code derivation, and the resume compatibility snapshot. `JobChunk` and `ChunkManifest` are the supporting state machine and immutable plan.

## Key Files
| File | Description |
|------|-------------|
| `job.ts` | Root aggregate. State: jobId, provider, status, cleanupPolicy, compatibility snapshot, chunks, manifest/final-markdown paths, error summary. Factories `createInitial()` / `restore()`; chunk mutations (`markChunkRunning/Succeeded/Failed`), filters (`getPendingChunks`/`getFailedChunks`), validated `updateStatus()`, `hydrateFromManifest()`, `reconcileForResume()`, `assertCompatibleSnapshot()`, and the `exitCode` getter. |
| `job-chunk.ts` | Per-chunk value object. Status `pending → running → {succeeded|failed}` plus `failed → pending` (retry); attempts counter, timestamps, markdown path, error summary. Factories `createPending()` / `restore()` with validated transitions. |
| `chunk-manifest.ts` | Immutable segmentation plan, validated on creation (sequential 1..N indices, monotonic non-overlapping time windows, no gaps). Factories `create()` / `restore()`; frozen `chunks` array; `version` pinned at 1. |
| `transcription-result.ts` | DTO interfaces only (no logic): `TranscriptionRequest` (chunk index, audio path, timing, optional job metadata) and `TranscriptionResult` (chunk index, markdown, optional provider metadata). Used by the `Transcriber` port. |

## For AI Agents

### Working In This Directory
- **State-transition maps are authoritative.** Adding/removing a Job or JobChunk status requires updating the allowed-transition tables, or validation throws. `succeeded`/`fatal_error` are terminal; `running` is never terminal (a crash mid-`running` must reconcile back to `pending`).
- **Never construct entities raw** — use the static factories; they apply validation and freezing. `ChunkManifest.chunks` is `Object.freeze`d; mutating it bypasses the index/timing validation.
- `Job.exitCode`: succeeded→0, partial_failed→2, else→1 (the CLI returns this).
- `Job.assertCompatibleSnapshot(actual)` is the resume gate; keep the 6-field snapshot (resolvedInputPath, inputSizeBytes, inputMtimeMs, provider, transcriberSignature, chunkDurationSeconds) aligned with the persisted records in `src/infrastructure/storage/`.
- `restore()` deserializes from JobStore records — keep it lossless with the persistence mapper.

### Testing Requirements
`tests/unit/job.test.ts`, `tests/unit/chunk-manifest.test.ts`. Pure logic — assert transitions and validation errors directly.

## Dependencies

### Internal
`src/shared/errors.ts` (`PipelineExitCode`), `src/shared/paths.ts` (`CleanupPolicy`, `JobPaths`). Cross-entity: `Job` owns `JobChunk[]` and hydrates from `ChunkManifest`.

### External
None.
