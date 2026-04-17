# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build          # Compile TypeScript to dist/
npm test               # Build + run all tests (Node.js native test runner)
npm run transcribe     # Build + run the CLI
```

Run a single test file:
```bash
npm run build --silent && node --test dist/tests/unit/parse-args.test.js
```

Run the CLI directly after building:
```bash
node dist/src/cli/main.js --input <file.mkv> --provider openai-whisper --output <dir>
```

There is no lint step — TypeScript strict mode (`strict: true`) is the quality gate.

## Architecture

The project follows a **hexagonal (ports and adapters)** pattern:

```
src/
  domain/         ← pure business logic, no I/O
    ports/        ← Transcriber, JobStore, MediaSegmenter interfaces
    entities/     ← JobState (state machine), ChunkManifest, TranscriptionResult
  application/    ← orchestration: run-transcription-job.ts, merge-transcripts.ts
  infrastructure/ ← I/O adapters
    providers/    ← FakeTranscriber, OpenAIWhisperTranscriber, OpenAIAudioTranscriber
    storage/      ← FileJobStore (mutation queue via Promise chaining)
    media/        ← FFmpegMediaSegmenter, ffprobe.ts
  cli/            ← argument parsing (parse-args.ts), dependency wiring (main.ts)
  shared/         ← paths, logger, errors, chunk-audio-format, env-file, process
```

### Key abstractions

- **`Transcriber` port** (`src/domain/ports/transcriber.ts`): implement this to add a new provider; wire it up in `src/cli/main.ts`.
- **`JobState` entity** (`src/domain/entities/job-state.ts`): enforces valid lifecycle transitions (`created → segmenting → ready → running → succeeded / partial_failed / fatal_error`). All mutations go through it.
- **`FileJobStore`** (`src/infrastructure/storage/file-job-store.ts`): serialises concurrent writes via a mutation queue (Promise chaining) to prevent race conditions during parallel transcription.
- **Orchestrator** (`src/application/run-transcription-job.ts`): drives the full pipeline — segment → persist manifest → dispatch chunks via `TaskPool` → merge.

### Resume semantics

A **compatibility snapshot** is stored with the job. On `--resume`, the snapshot is validated against the current invocation (file path/size/mtime, provider name, transcriber signature, chunk duration). Failed/orphaned chunks are downgraded to `pending` and retried; completed chunks are skipped.

### Providers

| Flag | Class | Key env vars |
|------|-------|-------------|
| `fake` | `FakeTranscriber` | `FAKE_TRANSCRIBER_LATENCY_MS`, `FAKE_TRANSCRIBER_FAIL_CHUNKS` |
| `openai-whisper` | `OpenAIWhisperTranscriber` | `OPENAI_API_KEY`, `OPENAI_WHISPER_LANGUAGE`, `OPENAI_WHISPER_PROMPT` |
| `openai-transcription` | `OpenAIAudioTranscriber` | `OPENAI_TRANSCRIPTION_MODEL`, `OPENAI_API_KEY` (or Azure variants) |

API keys can be placed in a `.env` file at the project root; it is loaded via `src/shared/env-file.ts` without overwriting existing `process.env` values.

### Audio format

All chunks are normalised to **PCM 16-bit mono 16 kHz WAV** before being sent to any provider (defined in `src/shared/chunk-audio-format.ts`).

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | All chunks succeeded |
| `1` | Fatal error / invalid usage |
| `2` | Partial failure — re-run with `--resume` |

### Module system

TypeScript is compiled to ESM (`module: NodeNext`). All local imports must include the `.js` extension (resolved to `.ts` at compile time).
