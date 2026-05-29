<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-05-28 -->

# integration

## Purpose
Cross-layer tests that wire multiple real components together (CLI → use case → orchestrator → providers → storage) using injected stubs/fakes instead of live external services. They validate the pipeline's end-to-end behavior — resume, partial-failure recovery, concurrency, persistence round-trips — while staying fully offline.

## Key Files
| File | Description |
|------|-------------|
| `transcription-orchestrator.test.ts` | Drives the run use case with custom `Transcriber`s (e.g. ordered/controlled for failure injection); verifies task-pool concurrency, retry, and chunk-failure tracking. |
| `file-job-store.test.ts` | Round-trips chunk manifest + job state through `FileJobStore` on disk; asserts persistence and path normalization. |
| `openai-transcription-cli.test.ts` | End-to-end `runCli()` with the `openai-transcription` provider using `StubMediaSegmenter` + a mocked OpenAI client; verifies config flow. |
| `openai-whisper-cli.test.ts` | Same end-to-end shape for the `openai-whisper` provider. |
| `ffmpeg-media-segmenter.test.ts` | Exercises `FFmpegMediaSegmenter` against **fake** `ffmpeg`/`ffprobe` shell scripts written into a temp dir; verifies chunk calculation for multi-hour media. |

## For AI Agents

### Working In This Directory
- **Real code, faked edges**: these call actual use-case/orchestrator/store code, so changes to error handling, retry, or persistence break them immediately — that's intentional.
- **Injection seams**: `runCli()` accepts custom factories (JobStore, MediaSegmenter, OpenAIAudioClient) and an env-object as its second argument. Tests pass env vars (e.g. `OPENAI_API_KEY`) as a literal, never the real environment.
- The ffmpeg test relies on temp shell scripts being executable (`0o755`); keep that.
- OpenAI is mocked with plain object literals — no `jest.fn()` introspection.
- Custom transcribers use `node:timers/promises` for delays; cleanup is via the `afterEach` temp-dir hook.

### Testing Requirements
Run with `npm run test:integration` (builds first). Stay within the 30s `testTimeout` by keeping everything stubbed.

## Dependencies

### Internal
`src/cli/main.ts` (`runCli`), `src/application/run-transcription-job-use-case.ts`, `src/infrastructure/storage/file-job-store.ts`, `src/infrastructure/media/ffmpeg-media-segmenter.ts`, `src/shared/*`, `tests/helpers/*`.

### External
`jest`, node `fs/promises`, `timers/promises`. ffmpeg & OpenAI are faked, never invoked for real.
