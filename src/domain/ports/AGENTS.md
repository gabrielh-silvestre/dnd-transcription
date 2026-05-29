<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-05-28 -->

# ports

## Purpose
The interfaces (ports) that decouple the application/domain core from infrastructure. Each port is implemented by one or more adapters in `src/infrastructure/`, enabling provider swapping and offline testing (fakes/stubs). No implementation logic lives here — only contracts and small pure helpers.

## Key Files
| File | Description |
|------|-------------|
| `job-store.ts` | Persistence contract. Async methods for artifacts/state: `hasPersistedJobArtifacts`, `initializeJob`, `writeManifest`/`readManifest`, `hydrateChunksFromManifest`, `readJobState`/`tryReadJobState`, `updateJobStatus`, `reconcileForResume`, `markChunk{Running,Succeeded,Failed}`, `writeChunkMarkdown`, `writeFinalMarkdown`, `readMarkdown`, `cleanupChunkArtifacts`; exposes a read-only `paths` (`JobPaths`). Implemented by `FileJobStore`. |
| `transcriber.ts` | Provider contract: `name`, `signature` (normalized config), `transcribe(request) → result`. Helper `createTranscriberSignature(config)` canonicalizes config (sorted keys) into the deterministic signature used for resume compatibility. |
| `transcriber-binding.ts` | Defers transcriber instantiation: `signature` + async `createTranscriber()`. Helper `bindTranscriber(transcriber)` wraps a ready `Transcriber`. Lets the CLI resolve credentials lazily. |
| `media-segmenter.ts` | Segmentation contract: `name` + async `segment({inputPath, jobRootDir, workingDir, chunkDurationMs}) → ChunkManifest`. Implemented by `FFmpegMediaSegmenter`. |

## For AI Agents

### Working In This Directory
- **`signature` determinism is critical**: `createTranscriberSignature()` must produce stable, sorted output. The signature is stored in the compatibility snapshot; a changed signature correctly invalidates an old `--resume` (prevents silently transcribing with different config).
- **`updateJobStatus()` returns the updated full state** — callers rely on the return value rather than re-reading. Don't return stale state.
- `segment()` must return chunks with sequential 1-based indices and monotonic non-overlapping windows (validated by `ChunkManifest`).
- `JobStore.paths` is read-only and stable for the job's lifetime; `jobRootDir` holds state files, `workingDir` holds chunk audio.
- Optional `jobMetadata`/`providerMetadata` on request/result are for logging only — they must not affect transcription logic.

### Testing Requirements
Ports themselves are interfaces; their contracts are validated through adapter tests (`tests/unit/`, `tests/integration/`) and the in-test fakes that implement them.

## Dependencies

### Internal
`src/domain/entities/*` (Job/Chunk/Manifest state types, transcription DTOs), `src/shared/{paths,errors}.ts`.

### External
None — pure interfaces.
