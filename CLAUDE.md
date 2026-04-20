# CLAUDE.md

This repository contains a TypeScript CLI for chunking long media files, transcribing them through pluggable providers, and merging the final markdown transcript. It also contains a repo-local **code wiki** in `docs/wiki/` that should be treated as the persistent documentation layer for the codebase.

## Commands

```bash
npm run build
npm test
npm run transcribe -- --input <file.mkv> --output <dir> --provider <provider>
npm run wiki -- <init|refresh|ingest|query|lint>
```

Focused checks:

```bash
npm run build --silent && node --test dist/tests/unit/parse-args.test.js
npm run build --silent && node --test dist/tests/unit/wiki/*.test.js
```

## Wiki-first workflow

- Treat `docs/wiki/` as the persistent documentation layer that sits between the agent and the raw code.
- Treat `docs/wiki/evidence/` as deterministic raw material and `docs/wiki/pages/` as the durable refinement layer.
- Repo-local refinement skills live in `.agents/skills/` and `.claude/skills/`.
- Start with `docs/wiki/index.md`, `docs/wiki/schema.md`, and `docs/wiki/refinement-playbook.md` before broad exploration.
- For cross-cutting, architectural, or history-sensitive questions, run `npm run wiki -- query --query "<terms>"` before searching `src/` or `tests/`.
- Read `docs/wiki/pages/` first when it exists, then verify against `docs/wiki/evidence/` and raw files when editing behavior, confirming edge cases, or resolving ambiguity.
- Never hand-edit `docs/wiki/evidence/`; regenerate it through the wiki CLI.
- Prefer the repo-local skills `wiki-refinement-pass`, `wiki-promote-answer`, and `wiki-refinement-audit` for refinement work when available.
- If the session produces a durable answer, comparison, or architectural note, file it into `docs/wiki/pages/` and update `docs/wiki/pages/index.md`.
- Periodically run `npm run wiki -- lint` to keep the wiki healthy.

## Navigation order

1. Read `.claude/project-context/current-state.md`.
2. Read `.claude/project-context/architecture.md`.
3. Read `docs/wiki/index.md`, `docs/wiki/schema.md`, and `docs/wiki/refinement-playbook.md`.
4. Read `docs/wiki/pages/index.md` and `docs/wiki/evidence/index.md`.
5. For broad or architectural questions, run `npm run wiki -- query --query "<terms>"`.
6. Read raw files in `src/` and `tests/` only after the shared context or wiki is insufficient.

## Current architecture

- `src/cli/`: entrypoint, arg parsing, input normalization, `.env` loading, dependency composition
- `src/application/`: `RunTranscriptionJobUseCase` and `MergeTranscriptsUseCase`
- `src/domain/`: `Job`, `JobChunk`, `ChunkManifest`, and the core ports
- `src/infrastructure/`: filesystem persistence, ffmpeg/ffprobe media handling, concurrency, and provider adapters
- `src/wiki/`: repo-local code wiki maintenance CLI and generators

## Invariants

- `manifest.json` and `job-state.json` remain backward compatible
- `--resume` compatibility depends on `resolvedInputPath`, `inputSizeBytes`, `inputMtimeMs`, `provider`, `transcriberSignature`, and `chunkDurationSeconds`
- exit codes stay `0` for full success, `1` for fatal error/invalid usage, and `2` for reusable partial failure
- all provider uploads receive WAV PCM 16-bit mono 16000 Hz audio
- `openai-whisper` stays pinned to `whisper-1`

## Code wiki contract

- The wiki documents the codebase itself, not the contents of generated transcriptions.
- Raw sources are `src/`, `tests/`, `README.md`, `.omx/plans/`, and `.claude/project-context/`.
- `docs/wiki/evidence/` is deterministic CLI output and must be treated as read-only evidence.
- `docs/wiki/pages/` is the refinement layer for durable synthesis.
- `docs/wiki/schema.md` and `docs/wiki/refinement-playbook.md` define page conventions and maintenance workflows.
- The wiki should be consulted before broad code rediscovery and treated as the first synthesized knowledge layer for the repository.
- After material code or architecture changes, regenerate evidence by running `npm run wiki -- ingest --source <path>` or `npm run wiki -- refresh`.
- If an analysis or answer becomes durable project knowledge, add or update a page under `docs/wiki/pages/` and keep `docs/wiki/pages/index.md` and `docs/wiki/log.md` current.

## Testing posture

- Prefer offline tests with stubs/fakes.
- Keep provider integrations mockable through dependency seams in the CLI and clients.
- There is no source-code lint step; TypeScript strictness and the test suite are the quality gates, while `npm run wiki -- lint` is only for wiki health checks.
