---
title: "Provider Adapter Evidence"
category: module
summary: "Observed provider matrix, signature rules, and adapter file inventory."
source_paths:
  - "src/infrastructure/providers"
  - "src/cli/default-transcriber-binding-factory.ts"
---
# Provider Adapter Evidence

This file is deterministic evidence for the provider adapter layer.

## Supported providers

- `fake`: deterministic/offline test provider
- `openai-whisper`: fixed to `whisper-1`
- `openai-transcription`: supports OpenAI or Azure backends

## Observed signature strategy

Provider configuration contributes to a stable `transcriberSignature` used by resume compatibility checks. This prevents resuming a job with a different model, backend, endpoint, prompt, or language setting.

## Observed upload guards

- OpenAI-based providers estimate WAV size before upload.
- The CLI rejects chunk durations whose normalized audio would exceed the configured upload limit.

## Relevant files

- `src/infrastructure/providers/AGENTS.md`
- `src/infrastructure/providers/fake-transcriber.ts`
- `src/infrastructure/providers/openai-audio-client.ts`
- `src/infrastructure/providers/openai-audio-provider-shared.ts`
- `src/infrastructure/providers/openai-audio-transcriber.ts`
- `src/infrastructure/providers/openai-transcription-config.ts`
- `src/infrastructure/providers/openai-whisper-config.ts`
- `src/infrastructure/providers/openai-whisper-transcriber.ts`
