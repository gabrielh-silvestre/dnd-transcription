<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-05-28 -->

# infrastructure

## Purpose
The right (driven) adapters of the hexagon — concrete implementations of the `domain/ports/` interfaces plus supporting machinery. This is where real I/O, subprocesses, the OpenAI SDK, and filesystem persistence live. Domain and application code reach these only through ports, so adapters can be swapped (e.g. fake provider in tests).

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `media/` | `FFmpegMediaSegmenter` (implements `MediaSegmenter`) + `probeMedia` ffprobe wrapper (see `media/AGENTS.md`) |
| `providers/` | `Transcriber` implementations: OpenAI Whisper, OpenAI/Azure audio, `FakeTranscriber`, + config builders (see `providers/AGENTS.md`) |
| `storage/` | `FileJobStore` (implements `JobStore`) + JSON record schemas & mappers (see `storage/AGENTS.md`) |
| `concurrency/` | `runTaskPool` bounded-concurrency worker pool (see `concurrency/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- Each adapter must honor its port contract exactly (method signatures, return shapes, error semantics) — the application layer depends on the port, not the class.
- **Cross-cutting invariants enforced here**:
  - Audio out of `media/` and into `providers/` is always WAV PCM 16-bit mono 16000 Hz (`src/shared/chunk-audio-format.ts`).
  - `storage/` records persist at `version: 1` and must stay backward compatible (`manifest.json`, `job-state.json`); add a new version branch rather than mutate.
  - `providers/` `signature` fields feed the resume compatibility check — changing a provider's config shape changes its signature and (correctly) invalidates old resumes.
  - `openai-whisper` is pinned to `whisper-1`.

### Testing Requirements
Unit + integration coverage in `tests/unit/` (config builders, client, mapper) and `tests/integration/` (ffmpeg via fake shell scripts, file job store round-trip). External tools/SDKs are always stubbed.

## Dependencies

### Internal
`src/domain/ports/*`, `src/domain/entities/*`, `src/shared/*`.

### External
`openai` (`OpenAI`, `AzureOpenAI`), node `fs`/`fs/promises`, `child_process` (`spawn`), `path`, `timers/promises`; external `ffmpeg`/`ffprobe` CLIs.
