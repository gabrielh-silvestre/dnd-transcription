---
title: "Architecture Overview"
summary: "Layered CLI architecture that keeps workflow orchestration in application, invariants in domain, and side effects in infrastructure."
status: "reviewed"
evidence_paths:
  - "../evidence/overview.md"
  - "../evidence/architecture.md"
source_paths:
  - "README.md"
  - "package.json"
  - "src/core/transcription-core.ts"
  - "src/cli/transcription-cli-application.ts"
  - "src/mcp/server.ts"
  - "src/mcp/main.ts"
  - "src/application/run-transcription-job-use-case.ts"
  - "src/application/run-batch-transcription-use-case.ts"
  - "src/application/merge-transcripts-use-case.ts"
  - "src/domain/entities/job.ts"
  - "src/infrastructure/storage/file-job-store.ts"
  - "src/infrastructure/media/ffmpeg-media-segmenter.ts"
  - "src/shared/env-file.ts"
  - "src/shared/logger.ts"
  - "src/shared/process.ts"
  - "src/shared/paths.ts"
  - "src/shared/chunk-audio-format.ts"
  - "tests/integration/transcription-orchestrator.test.ts"
last_refined_on: "2026-06-06"
---
# Architecture Overview

## What It Covers

This page summarizes the stable layer map for the transcription CLI, the direction of dependencies between layers, and the runtime contracts that matter when the pipeline evolves.

## How It Works

- `src/core/` is the framework-agnostic composition layer. `runTranscriptionCore({ request, provider, chunkDurationMs, logger, createTranscriberBinding, ...deps })` builds the default `JobStore`/`MediaSegmenter`, runs `RunBatchTranscriptionUseCase`, and returns the structured `{ exitCode, fileResults }`. It never parses argv, loads `.env`, validates the output dir, writes to stdout, logs the summary, or swallows errors — those are gateway concerns. It imports neither `src/cli/` nor `src/mcp/`.
- Two **gateways** drive that core as siblings: the **CLI** (`src/cli/`) and the **MCP stdio server** (`src/mcp/`). Each translates its own input surface into the same core call and the same `{ exitCode, fileResults }` back into its own output channel. Provider/infra is resolved by the gateway (CLI flag vs. startup env) and injected into the core; it is not part of the core's `TranscriptionRequest`. See [Core + Gateways (CLI and MCP)](./mcp-gateway.md).
- `src/cli/` is the CLI gateway (one of the two adapters). It parses argv, resolves the input path, short-circuits `--help`/`--version`, loads `.env` without overwriting exported shell variables, composes the concrete dependencies, delegates execution to `runTranscriptionCore`, logs the batch summary, and maps any throw to exit code 1. Single-file (`N=1`) behavior is byte-for-byte identical to before the core extraction.
- `src/application/` owns end-to-end workflow orchestration. `RunTranscriptionJobUseCase` decides whether the run is a new bootstrap or a `--resume`, drives chunk execution through the task pool, and decides whether the job ends in `succeeded`, `partial_failed`, or `fatal_error`.
- Multi-input runs are orchestrated one level up by `RunBatchTranscriptionUseCase`: it fans out to one `RunTranscriptionJobUseCase` per file with bounded `fileConcurrency`, gives each file its own `<output>/<slug>-<hash>/` subdirectory plus a `batch-index.json`, and aggregates per-file exit codes into the batch exit code. A single `--input` keeps the legacy flat `<output>/transcript.md` layout.
- `src/domain/` is the authoritative rule layer. `Job`, `JobChunk`, and `ChunkManifest` define allowed state transitions, exit-code derivation, and resume compatibility checks instead of letting adapters invent those rules independently.
- `src/infrastructure/` implements the side-effecting ports. `FileJobStore` persists `manifest.json` and `job-state.json`, `FFmpegMediaSegmenter` normalizes chunks into WAV PCM 16-bit mono 16000 Hz, and the provider adapters isolate SDK-specific behavior.
- The build and runtime entrypoints stay intentionally simple: `npm run build` clears `dist/` before `tsc`, and both `npm run transcribe` and `npm run wiki` execute the compiled CLI from `dist/`.
- `src/shared/` currently holds cross-cutting helper modules for env loading, logging, path handling, chunk-audio format constants, and subprocess execution that are reused across the runtime layers.

## Evidence

- Evidence pages: [Deterministic Repository Evidence](../evidence/overview.md), [Architecture Evidence](../evidence/architecture.md)
- Raw sources checked: `README.md`, `package.json`, `src/core/transcription-core.ts`, `src/cli/transcription-cli-application.ts`, `src/mcp/server.ts`, `src/mcp/main.ts`, `src/application/run-transcription-job-use-case.ts`, `src/application/merge-transcripts-use-case.ts`, `src/domain/entities/job.ts`, `src/infrastructure/storage/file-job-store.ts`, `src/infrastructure/media/ffmpeg-media-segmenter.ts`, `src/shared/env-file.ts`, `src/shared/logger.ts`, `src/shared/process.ts`, `src/shared/paths.ts`, `src/shared/chunk-audio-format.ts`
- Verification spot-check: `tests/integration/transcription-orchestrator.test.ts` confirms that the layer split still produces ordered final output, resumable partial failure, and a no-op path for already-succeeded jobs.

## Open Questions

- Open documentation gap: this wiki does not yet define when logic should remain in `src/shared/` versus move into a runtime layer if that directory grows beyond helper modules.

## Related Pages

- [Core + Gateways (CLI and MCP)](./mcp-gateway.md)
- [Module Boundaries](./module-boundaries.md)
- [Provider Adapters](./provider-adapters.md)
- [Transcription Job Workflow](./transcription-job.md)
- [Resume Semantics](./resume-semantics.md)
- [Testing Strategy](./testing-strategy.md)
