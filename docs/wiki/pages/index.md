# Refined Pages Index

This file is **LLM-maintained**. The deterministic wiki pipeline may create it if missing, but it must not overwrite human/LLM refinements afterwards.

## Foundations

- [Architecture Overview](./architecture.md): Layer map, dependency direction, and the stable runtime contract around build, orchestration, and persistence.

## Modules

- [Core + Gateways (CLI and MCP)](./mcp-gateway.md): The framework-agnostic `src/core` and the two sibling gateways (CLI + MCP stdio server), the MCP `transcribe`/`transcription_health` tool surface, the env-only infra/secrets boundary (R3), the no-CLI-import rule (R4), and the per-gateway error boundary.
- [Module Boundaries](./module-boundaries.md): Responsibility map for core, the CLI and MCP gateways, application, domain, and infrastructure, including the main dependency seams.
- [Provider Adapters](./provider-adapters.md): Provider matrix, stable signature rules, lazy client materialization, and upload-size guards.

## Workflows

- [Transcription Job Workflow](./transcription-job.md): End-to-end execution from CLI input through chunk segmentation, bounded transcription, final merge, and cleanup.
- [Resume Semantics](./resume-semantics.md): Compatibility snapshot, resumable states, and which chunks are retried, skipped, or rejected.

## Analyses

- [Testing Strategy](./testing-strategy.md): How the suite protects schemas, exit codes, resume behavior, provider adapters, and wiki tooling.
- [CLI on Commander (ADR)](./cli-commander-migration.md): Why both CLIs parse argv with commander@15 behind the legacy parser classes, and which invariants the swap preserved.

## Open Questions

- None yet.
