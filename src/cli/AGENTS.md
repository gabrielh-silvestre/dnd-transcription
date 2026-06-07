<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-06-06 -->

# cli

## Purpose
The left (driving) adapter of the hexagonal architecture and the transcription binary's entry point. It turns raw `process.argv` into a typed run context, loads `.env`, resolves input paths, composes the dependency graph (job store, media segmenter, transcriber binding, logger), invokes `RunTranscriptionJobUseCase`, logs the outcome, and returns the process exit code.

## Key Files
| File | Description |
|------|-------------|
| `main.ts` | Node entrypoint; exports `main()` / `runCli()`, calls `TranscriptionCliApplication.run()` and sets `process.exitCode`. ESM-main detection via `pathToFileURL`. |
| `cli-argument-parser.ts` | Parses argv into a `CliParseResult` (help vs run) via `commander`; validates `--input` (repeatable), `--output`, `--chunk-duration-seconds`, `--concurrency`, `--file-concurrency` (default 1), `--provider`, `--cleanup-policy`, `--resume`; throws `ValidationError` on bad input. |
| `input-path-resolver.ts` | `InputPathResolver` / `resolveCliInputPath()`; resolves relative inputs against the default `.ignore/raw/` directory to absolute paths. |
| `transcription-cli-application.ts` | Orchestrator. Accepts an injectable `CliDependencies` seam (job-store / segmenter / transcriber / logger factories), normalizes paths, wires the use case, runs it, returns the exit code. |
| `default-transcriber-binding-factory.ts` | `DefaultTranscriberBindingFactory` implementing `TranscriberBindingFactory`; maps a provider string (`fake`, `openai-whisper`, `openai-transcription`) to a concrete `Transcriber`, building OpenAI config + client as needed. |

## For AI Agents

### Working In This Directory
- **Exit-code contract is sacred**: the CLI returns `Job.exitCode` (0 success, 1 fatal/invalid usage, 2 partial failure). Don't reinterpret these.
- **Provider resolution is exact-match**: unknown provider strings throw ("Provedor nao esta implementado"). Register new providers here.
- **`--resume` validation**: must reconcile against persisted artifacts; the compatibility check (`assertCompatibleSnapshot`) must not be bypassed.
- Validation messages are in Portuguese — keep them.
- The `CliDependencies` injection seam is what every integration test relies on; preserve it when refactoring.

### Testing Requirements
Covered by `tests/unit/parse-args.test.ts`, `resolve-cli-input-path.test.ts`, `default-transcriber-binding-factory.test.ts`, `transcription-cli-application.test.ts`, and the `tests/integration/openai-*-cli.test.ts` end-to-end runs.

## Dependencies

### Internal
`src/application/run-transcription-job-use-case.ts`, `src/domain/ports/*`, `src/domain/entities/*`, `src/infrastructure/*` (FileJobStore, FFmpegMediaSegmenter, providers), `src/shared/*` (logger, errors, paths, env-file).

### External
node `path`, `url` (`pathToFileURL`), `crypto` (`randomUUID`), `fs/promises` (`stat`); `commander`; `openai` SDK (instantiated in the binding factory).
