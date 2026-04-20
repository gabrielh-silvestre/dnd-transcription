---
title: "Provider Adapters"
summary: "Provider matrix, stable signature rules, lazy client materialization, and upload-size guards for fake and OpenAI-backed transcription."
status: "reviewed"
evidence_paths:
  - "../evidence/modules/providers.md"
  - "../evidence/modules/cli.md"
source_paths:
  - "README.md"
  - "src/cli/default-transcriber-binding-factory.ts"
  - "src/domain/ports/transcriber-binding.ts"
  - "src/infrastructure/providers/fake-transcriber.ts"
  - "src/infrastructure/providers/openai-whisper-config.ts"
  - "src/infrastructure/providers/openai-transcription-config.ts"
  - "src/infrastructure/providers/openai-audio-provider-shared.ts"
  - "src/shared/chunk-audio-format.ts"
  - "tests/unit/default-transcriber-binding-factory.test.ts"
  - "tests/unit/openai-whisper-config.test.ts"
  - "tests/unit/openai-transcription-config.test.ts"
  - "tests/integration/openai-whisper-cli.test.ts"
  - "tests/integration/openai-transcription-cli.test.ts"
last_refined_on: "2026-04-20"
---
# Provider Adapters

## What It Covers

This page describes which transcription providers exist, how configuration becomes a stable resume signature, and where the repo enforces provider-specific safety checks.

## How It Works

- `DefaultTranscriberBindingFactory` selects the provider during CLI composition. The application use case only receives a `TranscriberBinding`, so provider branching stays out of orchestration code.
- The `fake` provider is the offline baseline used by tests. Its binding preserves a synchronous creation path and derives its signature from deterministic options such as synthetic latency and planned failures.
- `openai-whisper` is intentionally pinned to `whisper-1` with `responseFormat: "json"`. It requires `OPENAI_API_KEY` and optionally folds normalized `language` and `prompt` into the stable `transcriberSignature`.
- `openai-transcription` requires `OPENAI_TRANSCRIPTION_MODEL`, supports `openai` and `azure` backends, and includes backend-specific fields such as endpoint, API version, and deployment in the signature when applicable.
- OpenAI-backed providers share the same preflight upload guard. The code estimates the size of the normalized WAV chunk from the canonical chunk format and rejects chunk durations that would exceed the configured upload limit before any SDK call is made.
- Client materialization is lazy. Unit tests confirm that the OpenAI client is not created until `createTranscriber()` is called, and integration tests confirm that a `--resume` no-op on a succeeded job never instantiates the client again.

## Evidence

- Evidence pages: [Provider Adapter Evidence](../evidence/modules/providers.md), [CLI Module Evidence](../evidence/modules/cli.md)
- Raw sources checked: `README.md`, `src/cli/default-transcriber-binding-factory.ts`, `src/domain/ports/transcriber-binding.ts`, `src/infrastructure/providers/fake-transcriber.ts`, `src/infrastructure/providers/openai-whisper-config.ts`, `src/infrastructure/providers/openai-transcription-config.ts`, `src/infrastructure/providers/openai-audio-provider-shared.ts`, `src/shared/chunk-audio-format.ts`
- Verification spot-checks: `tests/unit/default-transcriber-binding-factory.test.ts`, `tests/unit/openai-whisper-config.test.ts`, `tests/unit/openai-transcription-config.test.ts`, `tests/integration/openai-whisper-cli.test.ts`, `tests/integration/openai-transcription-cli.test.ts`

## Open Questions

- Inference: both OpenAI-backed paths currently share the same 25 MB upload limit constant. If upstream OpenAI and Azure limits diverge later, the provider configs will need separate limits instead of the shared guard.

## Related Pages

- [Architecture Overview](./architecture.md)
- [Module Boundaries](./module-boundaries.md)
- [Transcription Job Workflow](./transcription-job.md)
- [Resume Semantics](./resume-semantics.md)
- [Testing Strategy](./testing-strategy.md)
