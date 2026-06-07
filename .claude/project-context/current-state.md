# Current Project State

## Product

- Primary product: a TypeScript CLI that segments media, transcribes chunks in parallel, persists resumable job state, and merges a final markdown transcript.
- Secondary product: a repo-local **code wiki** in `docs/wiki/` that documents the architecture, modules, workflows, and testing strategy of the repository.

## Current baseline

- The main OO refactor is complete: the canonical layers are `src/core/` (shared composition), the `src/cli/` and `src/mcp/` gateways, `src/application/`, `src/domain/`, and `src/infrastructure/`.
- The repo-local code wiki was bootstrapped on 2026-04-20 and should now be treated as the persistent documentation layer for the codebase.
- The default automated test runner is now Jest over compiled artifacts in `dist/tests`.
- Since 2026-06-05 both CLIs (`transcribe` and `wiki`) parse argv with `commander@^15` encapsulated inside the legacy parser classes; flags, exit codes, public types, and DI seams are unchanged (see `docs/wiki/pages/cli-commander-migration.md`).
- Since 2026-06-06 the transcription composition lives in a framework-agnostic core (`src/core/`, `runTranscriptionCore`) shared by two sibling gateways: the CLI (`src/cli/`) and a new MCP stdio server (`src/mcp/`) exposing `transcribe`/`transcription_health`. Provider/secrets are startup env only (`MCP_TRANSCRIPTION_PROVIDER`, fail-fast) and stdout carries only JSON-RPC (see `docs/wiki/pages/mcp-gateway.md`). Single-file CLI behavior is byte-for-byte unchanged.
- `CLAUDE.md`, `AGENTS.md`, and `README.md` point to `docs/wiki/` as part of the navigation flow.

## What to read first next time

1. `docs/wiki/index.md`
2. `docs/wiki/schema.md`
3. `docs/wiki/pages/architecture.md`
4. `docs/wiki/pages/mcp-gateway.md`
5. `docs/wiki/pages/transcription-job.md`

## Key commands

- `npm test`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:file -- dist/tests/unit/parse-args.test.js`
- `npm run transcribe -- --input <file> --output <dir> --provider <provider>`
- `MCP_TRANSCRIPTION_PROVIDER=<provider> npm run mcp`
- `npm run wiki -- init`
- `npm run wiki -- ingest --source <path>`
- `npm run wiki -- query --query "<terms>"`
- `npm run wiki -- lint`
