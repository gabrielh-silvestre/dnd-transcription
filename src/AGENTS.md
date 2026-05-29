<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-05-28 -->

# src

## Purpose
All application source code. Two independent subsystems live here, each following a hexagonal (ports & adapters) layout:

1. **Transcription pipeline** (`cli/` → `application/` → `domain/` ← `infrastructure/`, with `shared/` cross-cutting utilities): chunks media, transcribes chunks via providers, merges the transcript, and persists resumable state.
2. **Code wiki** (`wiki/`): a self-contained CLI that generates and maintains the repo's documentation layer under `docs/wiki/`. It reuses only `src/shared/` utilities — it does **not** depend on the transcription domain/application/infrastructure.

Dependency direction in the pipeline: outer layers depend inward on `domain/` (entities + ports); `infrastructure/` implements the ports; nothing in `domain/` imports outward.

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `cli/` | Left adapter: arg parsing, path resolution, `.env` loading, dependency composition, entrypoint (see `cli/AGENTS.md`) |
| `application/` | Use cases that orchestrate the pipeline (see `application/AGENTS.md`) |
| `domain/` | Pure business model: entities + ports (interfaces) (see `domain/AGENTS.md`) |
| `infrastructure/` | Right adapters: ffmpeg media, providers, file persistence, concurrency (see `infrastructure/AGENTS.md`) |
| `shared/` | Cross-cutting utilities: errors, logger, paths, env, audio format, subprocess (see `shared/AGENTS.md`) |
| `wiki/` | Standalone code-wiki maintenance CLI (see `wiki/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- Respect the hexagonal boundaries: `domain/` must stay free of I/O and npm SDKs; put adapters in `infrastructure/`; orchestration in `application/`; wiring/IO-bootstrapping in `cli/`.
- ESM imports reference compiled `.js` paths (e.g. `import { Job } from "../domain/entities/job.js"`).
- New transcription providers are added in `infrastructure/providers/` and registered in `cli/default-transcriber-binding-factory.ts` — they must expose a stable `signature` (resume compatibility) and produce markdown from WAV PCM 16-bit mono 16kHz audio.

### Testing Requirements
Every module here is exercised by `tests/` against the compiled output in `dist/`. Build before testing.

### Common Patterns
- Ports defined in `domain/ports/`, adapters in `infrastructure/`.
- Dependency injection via constructor/options seams so tests can swap fakes.
- Domain entities use static factories (`createInitial`/`createPending`) + `restore()` for rehydration from persisted records.

## Dependencies

### Internal
All pipeline layers ultimately reference `domain/` and `shared/`. `wiki/` references only `shared/`.

### External
`openai` (in `infrastructure/providers/`), node built-ins (`fs`, `path`, `child_process`, `crypto`, `url`, `timers/promises`), external `ffmpeg`/`ffprobe` CLIs.
