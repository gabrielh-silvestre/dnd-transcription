<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-06-06 -->

# shared

## Purpose
Cross-cutting, domain-agnostic utilities used across every layer (and by the wiki subsystem): error types, logging, path conventions, `.env` parsing, the canonical audio-format constants, subprocess execution, and CLI argument-parsing helpers. Most modules depend only on node built-ins; `commander-helpers.ts` depends on the `commander` npm package.

## Key Files
| File | Description |
|------|-------------|
| `chunk-audio-format.ts` | Frozen `chunkAudioFormat` constants (wav / pcm_s16le / s16 / 16-bit / mono / 16000 Hz / 44-byte header) + `chunkAudioBytesPerSecond` and `estimateChunkAudioSizeBytes(chunkDurationMs)`. The single source of truth for the upload audio format. |
| `commander-helpers.ts` | Shared `commander` parser helpers used by both CLIs (`transcribe` and `wiki`): `createPositiveIntegerParser`, `createRejectDashDashParser`, `collectRejectingDashDash`, `translateCommanderError`; also exports `INTEGER_FLAGS` and `STRING_VALUE_FLAGS` sets for error-message normalisation. Depends on `commander`. |
| `errors.ts` | `AppError` (with `exitCode` + `phase`), `ValidationError` (phase `cli`), `ExternalCommandError` (command/stdout/stderr); `toError()` normalizer and `summarizeError()` message extractor. |
| `logger.ts` | `Logger` interface (`info`/`warn`/`error`) and `createLogger()` writing ISO-timestamped, scoped, JSON-metadata lines (errors to stderr). |
| `env-file.ts` | `parseEnvFile(content)` (handles `export`, quotes, escapes, comments) and `loadEnvFile()` which merges `.env` into env **without** overriding existing keys; missing file is a no-op. |
| `paths.ts` | `resolveJobPaths(outputDir)` → `JobPaths` (root, manifest, job-state, chunks, transcripts, final transcript); `CleanupPolicy` type; chunk index/filename formatters; POSIX path normalization (`normalizeRelativePath`, `resolveFromRoot`); `deriveJobSubdir(resolvedAbsolutePath)` — generates the `<basename>-<hash>` slug used as a per-file subdirectory in multi-input batch layout. |
| `process.ts` | `runCommand(command[], options?)` — spawns a subprocess, collects stdout/stderr, throws `ExternalCommandError` on non-zero exit or `ENOENT`. |

## For AI Agents

### Working In This Directory
- **`chunk-audio-format.ts` is load-bearing**: the 16 kHz / mono / s16 / 44-byte-header values back the OpenAI upload-size estimate and the ffmpeg flags. Changing any value ripples into provider compatibility and size validation.
- **Path normalization to POSIX** (`\` → `/`) is what makes persisted records resume cross-platform — keep it.
- Error messages are user-facing and in Portuguese; exit codes carried by `AppError` map to the CLI contract (1 = error). Don't repurpose codes.
- `loadEnvFile()` deliberately does not overwrite already-set env vars; preserve that precedence.

### Testing Requirements
Covered by `tests/unit/env-file.test.ts` (and indirectly by most other suites). Keep utilities pure and deterministic.

## Dependencies

### Internal
None (leaf layer).

### External
node `fs/promises`, `path`, `process`, `child_process` (`spawn`); `commander` (for `commander-helpers.ts`).
