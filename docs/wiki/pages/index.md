# Refined Pages Index

This file is **LLM-maintained**. The deterministic wiki pipeline may create it if missing, but it must not overwrite human/LLM refinements afterwards.

## Foundations

- [Architecture Overview](./architecture.md): Layer map, dependency direction, and the stable runtime contract around build, orchestration, and persistence.

## Modules

- [Module Boundaries](./module-boundaries.md): Responsibility map for CLI, application, domain, and infrastructure, including the main dependency seams.
- [Provider Adapters](./provider-adapters.md): Provider matrix, stable signature rules, lazy client materialization, and upload-size guards.

## Workflows

- [Transcription Job Workflow](./transcription-job.md): End-to-end execution from CLI input through chunk segmentation, bounded transcription, final merge, and cleanup.
- [Resume Semantics](./resume-semantics.md): Compatibility snapshot, resumable states, and which chunks are retried, skipped, or rejected.

## Analyses

- [Testing Strategy](./testing-strategy.md): How the suite protects schemas, exit codes, resume behavior, provider adapters, and wiki tooling.

## Open Questions

- None yet.
