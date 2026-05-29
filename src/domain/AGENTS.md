<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-05-28 -->

# domain

## Purpose
The core of the hexagon: pure business model with **no I/O and no external SDKs**. It defines the entities (job/chunk/manifest state machines and value objects) and the ports (interfaces) that infrastructure adapters must satisfy. Everything else depends inward on this layer; this layer depends on nothing outward (only on `src/shared/` type helpers).

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `entities/` | Aggregates & value objects: `Job`, `JobChunk`, `ChunkManifest`, transcription request/result DTOs (see `entities/AGENTS.md`) |
| `ports/` | Interfaces the infrastructure implements: `JobStore`, `Transcriber`, `TranscriberBinding`, `MediaSegmenter` (see `ports/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- **Keep it pure.** No `fs`, `child_process`, `openai`, or any adapter logic. If you need I/O, define a port here and implement it in `src/infrastructure/`.
- **State machines are enforced here**: Job (`created → segmenting → ready → running → {succeeded|partial_failed|fatal_error}`, with `partial_failed → running` for retry) and JobChunk (`pending → running → {succeeded|failed}`, plus `failed → pending`). Adding a status means updating the allowed-transition maps, or validation breaks.
- **Compatibility snapshot** (resolvedInputPath, inputSizeBytes, inputMtimeMs, provider, transcriberSignature, chunkDurationSeconds) is the resume gate — keep its shape in sync with the persisted records in `src/infrastructure/storage/`.
- Construct entities only through their static factories (`createInitial`/`createPending`/`create`) or `restore()`; never bypass validation.

### Testing Requirements
Covered by `tests/unit/{job,chunk-manifest}.test.ts`. Pure-logic tests, no temp dirs needed.

## Dependencies

### Internal
`src/shared/{errors,paths}.ts` for shared types (`PipelineExitCode`, `CleanupPolicy`, `JobPaths`).

### External
None — pure TypeScript.
