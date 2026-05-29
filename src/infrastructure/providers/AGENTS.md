<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-05-28 -->

# providers

## Purpose
Transcription provider adapters implementing the `Transcriber` port, plus their config builders and shared helpers. Covers OpenAI Whisper, the OpenAI/Azure audio-transcription backends, and a `FakeTranscriber` for offline tests. Config builders read env vars and emit frozen config objects carrying a deterministic `transcriberSignature`.

## Key Files
| File | Description |
|------|-------------|
| `openai-audio-transcriber.ts` | `OpenAIAudioTranscriber` (implements `Transcriber`). Retry loop (maxRetries 2, 250 ms delay) around the client call; classifies errors as retryable; wraps the response as `TranscriptionResult`. Base class for the Whisper adapter. |
| `openai-whisper-transcriber.ts` | `OpenAIWhisperTranscriber` (extends `OpenAIAudioTranscriber`); binds provider `openai-whisper`, model `whisper-1`. |
| `openai-audio-client.ts` | `DefaultOpenAIAudioClient` (implements internal `OpenAIAudioClient`) wrapping `OpenAI`/`AzureOpenAI`; `transcribe(audioPath, language?, prompt?)`. `classifyOpenAIAudioError()` flags retryable cases (408/409/429/5xx, connection errors, ECONNRESET/ETIMEDOUT). |
| `openai-whisper-config.ts` | `createOpenAIWhisperConfig()` — builds config from env (`OPENAI_API_KEY` required; `OPENAI_WHISPER_LANGUAGE`/`_PROMPT` optional), validates chunk size vs the 25 MB limit, returns a frozen config with signature. |
| `openai-transcription-config.ts` | `createOpenAITranscriptionConfig()` — `openai` or `azure` backend; models `whisper-1`/`gpt-4o-transcribe`/`gpt-4o-mini-transcribe`; Azure requires endpoint + apiVersion (deployment defaults to model). Returns a backend-tagged union config. |
| `openai-audio-provider-shared.ts` | Constants/helpers: `OPENAI_AUDIO_RESPONSE_FORMAT="json"`, `OPENAI_AUDIO_UPLOAD_LIMIT_BYTES=25_000_000`, `assertOpenAIAudioChunkFitsUploadLimit()`, `normalizeOptionalValue()` (trim + null-coalesce). |
| `fake-transcriber.ts` | `FakeTranscriber` (implements `Transcriber`); configurable latency (`FAKE_TRANSCRIBER_LATENCY_MS`) and forced failures (`FAKE_TRANSCRIBER_FAIL_CHUNKS`); emits markdown with chunk metadata. Used by tests and `scripts/`. |

## For AI Agents

### Working In This Directory
- **`openai-whisper` stays pinned to `whisper-1`** — do not change.
- **Signature ⇒ resume compatibility**: a config's `transcriberSignature` captures provider/model/language/prompt/params. Changing config shape changes the signature and invalidates old resumes (intended). `FakeTranscriber`'s signature includes its latency/fail set.
- **25 MB upload limit**: chunks must fit after WAV header + PCM encoding; config builders validate this against `estimateChunkAudioSizeBytes`.
- Response format is hardcoded `"json"` (not vtt/srt).
- Retry only on `retryable` errors; non-retryable fail immediately. The delay function is injectable for tests.
- Requires `openai` SDK v6.x semantics (`OpenAI`/`AzureOpenAI` constructors). Config creation throws `ValidationError` (phase `provider`) on missing/invalid env.

### Testing Requirements
`tests/unit/openai-{audio-client,transcription-config,whisper-config,whisper-transcriber}.test.ts` and `default-transcriber-binding-factory.test.ts`; integration via `tests/integration/openai-*-cli.test.ts`. The OpenAI client is mocked with plain object literals — keep that seam.

## Dependencies

### Internal
`src/domain/ports/transcriber.ts`, `src/domain/entities/transcription-result.ts`, `src/shared/{chunk-audio-format,errors,paths}.ts`.

### External
`openai` (`OpenAI`, `AzureOpenAI`), node `fs` (`createReadStream`), `timers/promises`, `path`.
