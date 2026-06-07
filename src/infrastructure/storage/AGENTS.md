<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-06-06 -->

# storage

## Purpose
Job-state and chunk-manifest persistence. Implements the `JobStore` port over JSON files on disk, with serially-queued mutations, versioned record schemas, and bidirectional domain↔record mapping. This is where `manifest.json` and `job-state.json` are written and read.

## Key Files
| File | Description |
|------|-------------|
| `file-job-store.ts` | `FileJobStore` (implements `JobStore`). Wraps the `Job` entity; serializes writes through a `mutationQueue`; implements init/manifest/state/chunk/markdown/cleanup operations by `restore()`-ing the Job, mutating, `touch()`-ing, and writing back the record. |
| `file-batch-index-writer.ts` | `FileBatchIndexWriter` (implements `BatchIndexWriter`). Writes `batch-index.json` (shape `{ entries: [...] }`) in the output directory with one entry per input file (`inputPath`, `subdir`, `exitCode`, `status`). Used by `RunBatchTranscriptionUseCase` in multi-input mode. |
| `chunk-manifest-record.ts` | `ChunkManifestRecord` / `ChunkManifestRecordEntry` — the persisted manifest JSON schema (version, createdAt, inputPath, chunkDurationMs, totalDurationMs, chunks[]). |
| `job-state-record.ts` | `JobStateRecord` / `JobChunkStateRecord` / `JobCompatibilitySnapshotRecord` — the persisted job-state JSON schema, including the resume compatibility snapshot with `transcriberSignature`. |
| `job-persistence-mapper.ts` | Pure mappers: `toChunkManifestRecord`/`fromChunkManifestRecord`, `toJobStateRecord`/`fromJobStateRecord`. Normalizes relative paths to POSIX, ISO timestamps, and sorts chunks by index for deterministic output. |

## For AI Agents

### Working In This Directory
- **Backward compatibility is an invariant**: records persist at `version: 1`. If the schema must change, add a `version: 2` branch — never silently break `version: 1` reads of existing `manifest.json` / `job-state.json`.
- **POSIX path normalization** (`\` → `/`) on write is what lets jobs resume across Windows/Unix — keep it on both sides of the mapper.
- ISO timestamp normalization avoids drift across read/write cycles.
- The `mutationQueue` serializes writes **within a process**; it is not multi-process safe (no lock file). Don't assume cross-process safety.
- `hasPersistedJobArtifacts()` gates resume; chunks are sorted by index in the mapper so serialization is idempotent.

### Testing Requirements
`tests/unit/job-persistence-mapper.test.ts` (round-trip + path normalization) and `tests/integration/file-job-store.test.ts` (disk round-trip). Assert that a written-then-read job is byte-stable where expected.

## Dependencies

### Internal
`src/domain/entities/{job,job-chunk,chunk-manifest}.ts`, `src/domain/ports/job-store.ts`, `src/shared/paths.ts`.

### External
node `fs/promises` (`mkdir`, `readFile`, `writeFile`, `stat`, `rm`).
