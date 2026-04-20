---
title: "Testing Strategy"
summary: "How the suite protects persistence schemas, exit codes, resume behavior, provider adapters, and the repo-local wiki tooling."
status: "reviewed"
evidence_paths:
  - "../evidence/testing.md"
  - "../evidence/overview.md"
source_paths:
  - "README.md"
  - "package.json"
  - "src/wiki/application/code-wiki-service.ts"
  - "src/wiki/cli/wiki-argument-parser.ts"
  - "tests/unit/job.test.ts"
  - "tests/unit/default-transcriber-binding-factory.test.ts"
  - "tests/unit/openai-whisper-config.test.ts"
  - "tests/unit/openai-transcription-config.test.ts"
  - "tests/unit/task-pool.test.ts"
  - "tests/unit/wiki/code-wiki-service.test.ts"
  - "tests/unit/wiki/wiki-argument-parser.test.ts"
  - "tests/integration/file-job-store.test.ts"
  - "tests/integration/transcription-orchestrator.test.ts"
  - "tests/integration/openai-whisper-cli.test.ts"
  - "tests/integration/openai-transcription-cli.test.ts"
last_refined_on: "2026-04-20"
---
# Testing Strategy

## What It Covers

This page summarizes how the repository tests the pipeline, what contracts the suite treats as high risk, and which checks are intentionally left outside the default `npm test` path.

## How It Works

- The default suite is compiled-code-first. `npm test` runs `npm run build --silent` and then executes `node --test dist/tests`, so the test path validates both TypeScript compilation and runtime behavior from built artifacts.
- Unit tests protect the rule-heavy seams: CLI help and dependency injection, job and chunk state machines, provider config normalization, upload-limit preflight, task-pool concurrency, env-file parsing, and the wiki service itself.
- Integration tests cover the I/O-heavy boundaries: transcription orchestration, file-store round trips, FFmpeg segmentation, OpenAI-backed CLI wiring, resume behavior, and ordered final-merge output.
- The suite treats persistence compatibility as a first-class contract. Tests explicitly assert the persisted `manifest.json` and `job-state.json` shape, the stability of exit codes `0`, `1`, and `2`, and the behavior of resume reconciliation.
- Provider tests stay offline by design. The OpenAI clients are stubbed so the suite can verify signature handling, retry behavior, and environment loading without requiring network access.
- `npm run verify:long-input` is separate from `npm test`. It exists for host-dependent verification of long media handling and does not run in the normal suite.

## Evidence

- Evidence pages: [Testing Evidence](../evidence/testing.md), [Deterministic Repository Evidence](../evidence/overview.md)
- Raw sources checked: `README.md`, `package.json`, `src/wiki/application/code-wiki-service.ts`, `src/wiki/cli/wiki-argument-parser.ts`, `tests/unit/job.test.ts`, `tests/unit/default-transcriber-binding-factory.test.ts`, `tests/unit/openai-whisper-config.test.ts`, `tests/unit/openai-transcription-config.test.ts`, `tests/unit/task-pool.test.ts`, `tests/unit/wiki/code-wiki-service.test.ts`, `tests/unit/wiki/wiki-argument-parser.test.ts`, `tests/integration/file-job-store.test.ts`, `tests/integration/transcription-orchestrator.test.ts`, `tests/integration/openai-whisper-cli.test.ts`, `tests/integration/openai-transcription-cli.test.ts`

## Open Questions

- Long-input verification is not part of `npm test`, so regressions that only appear with very large media still depend on someone running `npm run verify:long-input` deliberately.

## Related Pages

- [Architecture Overview](./architecture.md)
- [Module Boundaries](./module-boundaries.md)
- [Provider Adapters](./provider-adapters.md)
- [Transcription Job Workflow](./transcription-job.md)
- [Resume Semantics](./resume-semantics.md)
