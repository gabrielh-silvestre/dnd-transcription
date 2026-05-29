<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-05-28 -->

# unit

## Purpose
Fast, isolated tests of single modules — domain entities, CLI/arg parsing, path resolution, config builders, the OpenAI client/transcriber adapters, persistence mapper, and the task pool. Offline-first: external services are replaced with hand-written stubs and object literals.

## Key Files
| File | Description |
|------|-------------|
| `job.test.ts` | `Job` entity: status transitions, chunk aggregation, exit-code derivation. |
| `chunk-manifest.test.ts` | `ChunkManifest` creation, ordering, timestamp normalization, validation. |
| `job-persistence-mapper.test.ts` | Job-state/manifest ↔ record serialization; POSIX path normalization. |
| `parse-args.test.ts` | CLI arg parser: chunk-duration conversion, provider selection, resume flag, validation errors. |
| `resolve-cli-input-path.test.ts` | Input path resolution (relative vs absolute, default-dir prefixing). |
| `default-transcriber-binding-factory.test.ts` | Provider → transcriber resolution; fake (sync) vs OpenAI (lazy async) paths. |
| `transcription-cli-application.test.ts` | CLI orchestration with mocked parser/env/use-case; help short-circuits execution. |
| `openai-audio-client.test.ts` | OpenAI SDK adapter; request capture and error classification. |
| `openai-transcription-config.test.ts` | OpenAI/Azure config builders; env parsing, defaults, signature generation. |
| `openai-whisper-config.test.ts` | Whisper config creation and env validation. |
| `openai-whisper-transcriber.test.ts` | Transcriber adapter; retry/backoff on 429, language/prompt passing. |
| `env-file.test.ts` | `.env` parsing and load semantics. |
| `task-pool.test.ts` | Concurrent task pool: concurrency control and error handling. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `wiki/` | Unit tests for the code-wiki subsystem (see `wiki/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- **No `jest.mock()`/`jest.fn()`** — stubs are plain objects/classes matching port interfaces; assert via inputs they capture, not mock introspection.
- **Signature assertions are brittle by design**: config builders produce `JSON.stringify`-based `transcriberSignature` strings that tests assert exactly. Refactoring config object shape will break them — update the expectations deliberately (it reflects a real resume-compatibility change).
- `FakeTranscriber` is production code in `src/infrastructure/providers/`, not a test double here.
- Tests that touch the filesystem use `createTempDir()`; descriptions are in Portuguese.

### Testing Requirements
`npm run test:unit` (builds first). Run a single file with `npm run test:file -- dist/tests/unit/<name>.test.js`.

## Dependencies

### Internal
`src/cli/*`, `src/domain/*`, `src/infrastructure/providers/*`, `src/infrastructure/storage/*`, `src/shared/*`, `tests/helpers/*`.

### External
`jest` / `@jest/globals`, node `fs/promises`. `openai` is mocked via object literals.
