---
title: "Testing Evidence"
category: quality
summary: "Observed test layers, coverage goals, and raw test file inventory."
source_paths:
  - "tests"
  - "package.json"
  - "README.md"
---
# Testing Evidence

This file is deterministic evidence for the repository's testing posture.

## Current shape

- test files: 22

## Main test layers

- unit tests for parser, config normalization, task pool, persistence mappers, and provider wrappers
- integration tests for the orchestration flow, file job store, CLI wiring, and provider-specific CLI behavior
- optional host-dependent verification for long input scenarios through `npm run verify:long-input`

## Coverage goals

- preserve `manifest.json` and `job-state.json` schema
- preserve exit codes `0`, `1`, and `2`
- prove resume no-op behavior for already succeeded jobs
- keep provider tests mockable without real network access

## Relevant files

- `tests/helpers/stub-media-segmenter.ts`
- `tests/helpers/temp-dir.ts`
- `tests/integration/ffmpeg-media-segmenter.test.ts`
- `tests/integration/file-job-store.test.ts`
- `tests/integration/openai-transcription-cli.test.ts`
- `tests/integration/openai-whisper-cli.test.ts`
- `tests/integration/transcription-orchestrator.test.ts`
- `tests/unit/chunk-manifest.test.ts`
- `tests/unit/default-transcriber-binding-factory.test.ts`
- `tests/unit/env-file.test.ts`
- `tests/unit/job-persistence-mapper.test.ts`
- `tests/unit/job.test.ts`
- `tests/unit/openai-audio-client.test.ts`
- `tests/unit/openai-transcription-config.test.ts`
- `tests/unit/openai-whisper-config.test.ts`
- `tests/unit/openai-whisper-transcriber.test.ts`
- `tests/unit/parse-args.test.ts`
- `tests/unit/resolve-cli-input-path.test.ts`
- `tests/unit/task-pool.test.ts`
- `tests/unit/transcription-cli-application.test.ts`
- `tests/unit/wiki/code-wiki-service.test.ts`
- `tests/unit/wiki/wiki-argument-parser.test.ts`
