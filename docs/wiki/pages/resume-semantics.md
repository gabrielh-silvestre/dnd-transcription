---
title: "Resume Semantics"
summary: "Compatibility snapshot, resumable states, and the exact rules that decide which chunks are retried, skipped, or rejected."
status: "reviewed"
evidence_paths:
  - "../evidence/workflows/resume-semantics.md"
  - "../evidence/workflows/transcription-job.md"
source_paths:
  - "README.md"
  - "src/application/run-transcription-job-use-case.ts"
  - "src/application/run-batch-transcription-use-case.ts"
  - "src/domain/entities/job.ts"
  - "src/infrastructure/storage/file-job-store.ts"
  - "tests/unit/job.test.ts"
  - "tests/integration/file-job-store.test.ts"
  - "tests/integration/transcription-orchestrator.test.ts"
  - "tests/integration/openai-whisper-cli.test.ts"
  - "tests/integration/openai-transcription-cli.test.ts"
last_refined_on: "2026-06-06"
---
# Resume Semantics

## What It Covers

This page explains the compatibility snapshot used by `--resume`, which job states can be resumed, and how persisted chunk state is reconciled before a retry.

## How It Works

- Artifact presence and the `--resume` flag must agree, but the exact outcome depends on the layer. The isolated `RunTranscriptionJobUseCase` fails fast in both directions (artifacts without `--resume`, and `--resume` without artifacts). The CLI, however, always routes through `RunBatchTranscriptionUseCase`, which derives `effectiveResume = resume && hasPersistedJobArtifacts`. So via the CLI, `--resume` against a directory with no persisted artifacts does **not** fail — it starts a clean job — whereas artifacts present without `--resume` still fail fast.
- The compatibility snapshot is strict. Resume compares `resolvedInputPath`, `inputSizeBytes`, `inputMtimeMs`, `provider`, `transcriberSignature`, and `chunkDurationSeconds`.
- `created`, `segmenting`, and `fatal_error` are the only non-resumable states (rejected in `prepareResume`). `ready`, `partial_failed`, and `running` can continue, and `succeeded` is treated as a valid no-op terminal state. A job interrupted mid-transcription (Ctrl-C, kill, timeout) persists as `running` and is therefore resumable.
- Resume reconciliation is conservative. Chunks already marked `succeeded` stay skipped, chunks marked `failed` return to `pending`, and chunks left in `running` without `finishedAt` also return to `pending`.
- Chunk retry keeps history instead of wiping it. The failed chunk keeps its `attempts` count and `errorSummary`, while `startedAt` and `finishedAt` are cleared when it returns to `pending`.
- Provider configuration changes are part of the guardrail. Integration tests show that changing prompt, language, backend, deployment, or other signature inputs rejects `--resume` even when the output directory already contains a partial job.

## Evidence

- Evidence pages: [Resume Workflow Evidence](../evidence/workflows/resume-semantics.md), [Transcription Workflow Evidence](../evidence/workflows/transcription-job.md)
- Raw sources checked: `README.md`, `src/application/run-transcription-job-use-case.ts`, `src/application/run-batch-transcription-use-case.ts`, `src/domain/entities/job.ts`, `src/infrastructure/storage/file-job-store.ts`
- Verification spot-checks: `tests/unit/job.test.ts`, `tests/integration/file-job-store.test.ts`, `tests/integration/transcription-orchestrator.test.ts`, `tests/integration/openai-whisper-cli.test.ts`, `tests/integration/openai-transcription-cli.test.ts`
- Behavior validated end-to-end via the `fake` provider on 2026-06-06: resume from a `running` job after interruption (exit 0), rejection on `transcriberSignature` mismatch (exit 1), and clean start when `--resume` is passed without persisted artifacts. Operator steps in `docs/runbook.md` (P6).

## Open Questions

- Open documentation gap: the repo does not yet document an operator recovery path for jobs that die during `segmenting` before a complete manifest is persisted.

## Related Pages

- [Architecture Overview](./architecture.md)
- [Module Boundaries](./module-boundaries.md)
- [Provider Adapters](./provider-adapters.md)
- [Transcription Job Workflow](./transcription-job.md)
- [Testing Strategy](./testing-strategy.md)
