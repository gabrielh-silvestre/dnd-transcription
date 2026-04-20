---
title: "CLI Module Evidence"
category: module
summary: "Observed responsibilities, seams, and file inventory for the CLI layer."
source_paths:
  - "src/cli"
  - "src/shared/env-file.ts"
  - "README.md"
---
# CLI Module Evidence

This file is deterministic evidence for the CLI layer.

## Observed responsibilities

- expose the Node entrypoint via `src/cli/main.ts`
- parse and validate flags in `src/cli/cli-argument-parser.ts`
- normalize `--input` with `src/cli/input-path-resolver.ts`
- load `.env` without overriding exported shell variables
- create the default transcriber binding lazily based on the selected provider

## Dependency seams kept for tests

- `createJobStore`
- `createMediaSegmenter`
- `createTranscriberBinding`
- `createTranscriber`
- `createOpenAIAudioClient`
- `cwd`

## Observed behavior

- Help returns before env loading or use-case execution.
- The CLI does not materialize the real transcriber when a resumed job is already `succeeded`.
- Unknown providers fail in the binding factory, not deep inside the pipeline.

## Relevant files

- `src/cli/cli-argument-parser.ts`
- `src/cli/default-transcriber-binding-factory.ts`
- `src/cli/input-path-resolver.ts`
- `src/cli/main.ts`
- `src/cli/transcription-cli-application.ts`
