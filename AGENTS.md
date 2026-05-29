<!-- Generated: 2026-05-28 | Updated: 2026-05-28 -->

# dnd-transcription

## Purpose
TypeScript CLI that chunks long media files (e.g. multi-hour D&D session recordings), transcribes each chunk through pluggable providers (OpenAI Whisper, OpenAI/Azure audio transcription, or a fake provider for tests), and merges the per-chunk markdown into a single transcript. The pipeline is resumable, fault-tolerant (partial-failure aware), and built on a hexagonal architecture. The repo also ships a self-contained **code wiki** (`src/wiki/` + `docs/wiki/`) that documents the codebase itself.

## Key Files
| File | Description |
|------|-------------|
| `package.json` | Scripts (`build`, `test`, `transcribe`, `wiki`) and deps (`openai`, `jest`, `typescript`). ESM (`"type": "module"`). |
| `tsconfig.json` | TypeScript compiler config; emits to `dist/`. |
| `jest.config.cjs` | Jest config; runs compiled tests from `dist/tests`, `testMatch **/*.test.js`, setup `dist/tests/setup/jest.setup.js`, 30s timeout, no transform. |
| `README.md` | Human-facing project overview and usage. |
| `CLAUDE.md` | Agent instructions; wiki-first workflow, navigation order, invariants. |
| `.env` | Provider credentials/config (e.g. `OPENAI_API_KEY`); loaded by `src/shared/env-file.ts`. Not committed. |
| `.gitignore` | Ignores `dist/`, `.ignore/`, `tmp/`, agent state dirs, etc. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `src/` | Application source code — hexagonal layers + the wiki subsystem (see `src/AGENTS.md`) |
| `tests/` | Jest unit + integration suites, helpers, and setup (see `tests/AGENTS.md`) |
| `scripts/` | Standalone verification scripts (see `scripts/AGENTS.md`) |
| `docs/` | The repo-local code wiki under `docs/wiki/` (see `docs/AGENTS.md`) |

Not documented here (ephemeral data / agent state, safe to ignore when reasoning about the code): `dist/` (build output), `.ignore/` (real transcription outputs), `tmp/` (scratch job dirs), `graphify-out/` (generated graph), `.omc/`, `.omx/`, `.codex/`, `.agents/`, `.claude/` (agent tooling/state).

## For AI Agents

### Commands
```bash
npm run build                 # rm -rf dist/ then tsc -p tsconfig.json
npm test                      # build + full Jest suite (dist/tests)
npm run test:unit             # build + dist/tests/unit/
npm run test:integration      # build + dist/tests/integration/
npm run test:file -- dist/tests/unit/<name>.test.js   # single compiled test file
npm run transcribe -- --input <file> --output <dir> --provider <fake|openai-whisper|openai-transcription>
npm run wiki -- <init|refresh|ingest|query|lint>
npm run verify:long-input     # synthetic >3h media smoke check
```

### Working In This Repository
- **ESM + compiled tests**: source is `src/`, but Jest runs the **compiled** output in `dist/`. Always `npm run build` (every npm test script does this for you) before tests; never expect Jest to see uncompiled `.ts` edits.
- **No lint step**: TypeScript strictness and the Jest suite are the quality gates. `npm run wiki -- lint` only checks wiki health, not source code.
- **Offline-first tests**: external services (OpenAI, ffmpeg) are stubbed with hand-written fakes/classes, not `jest.mock()`. Keep tests network-free.
- **Portuguese user-facing strings**: CLI help, validation messages, and many test descriptions are in Portuguese — preserve the language for consistency.
- **Imports use `.js` extensions** (ESM) even when importing `.ts` sources.

### Invariants (do not break)
- `manifest.json` and `job-state.json` stay backward compatible (persisted at `version: 1`; add a new version branch rather than mutating the schema).
- `--resume` compatibility depends on `resolvedInputPath`, `inputSizeBytes`, `inputMtimeMs`, `provider`, `transcriberSignature`, and `chunkDurationSeconds`. A mismatch must fail loudly, never silently re-transcribe.
- Exit codes: `0` full success, `1` fatal error / invalid usage, `2` reusable partial failure (retryable with `--resume`).
- All provider uploads receive **WAV PCM 16-bit mono 16000 Hz** audio (see `src/shared/chunk-audio-format.ts`).
- `openai-whisper` stays pinned to `whisper-1`; `openai-transcription` supports backend `openai` or `azure`.
- The build must keep clearing `dist/` before compiling.

### Wiki-first workflow
For cross-cutting, architectural, or history-sensitive questions, consult the code wiki before broad `src/`/`tests/` exploration: read `docs/wiki/index.md`, `docs/wiki/schema.md`, `docs/wiki/refinement-playbook.md`, then run `npm run wiki -- query --query "<terms>"`. Treat `docs/wiki/pages/` as the refined layer and `docs/wiki/evidence/` as read-only deterministic evidence (regenerate via `npm run wiki -- ingest ...` / `refresh`; never hand-edit evidence). After material code/architecture changes, regenerate evidence in the same change.

## Dependencies

### External
- `openai` (^6.x) — Whisper / audio transcription client (also `AzureOpenAI`).
- `typescript` (^5.8) — strict compilation, the primary correctness gate.
- `jest` (^30) — test runner (run via `--experimental-vm-modules`).
- `ffmpeg` / `ffprobe` — external CLIs for media segmentation (not npm; must be on PATH for real transcription, stubbed in tests).

<!-- MANUAL: The section below is hand-authored agent-harness operating guidance (OMX v2). It is preserved across deepinit regenerations. -->

## OMX v2 operating model (preserved, harness-specific)

You are working inside a repo that uses oh-my-codex v2.

### Default operating model
- Start from `$ultrawork` unless the user explicitly asks for a narrower workflow.
- Route unclear or risky work through `$deep-interview`.
- Turn broad work into durable slices with `$plan`.
- Escalate to `$team` only when parallel durable execution is worth the overhead.
- Keep `.omx/` honest. If the HUD says a mode is active, there should be artifacts or tasks proving it.

### Durable artifacts
Maintain these when relevant: `.omx/plans/*.md`, `.omx/research/*.md`, `.omx/logs/execution-ledger.md`, `.omx/memory/*.json`, `.omx/state/*-state.json`, `.omx/state/tasks.json`, `.omx/state/reviews.json`, `.omx/state/inbox.json`, `.omx/team/team.json`.

### Agent roles
- `architect`: boundaries, risks, sequencing
- `planner`: execution slices, requirements, verification map
- `researcher`: brownfield map, research summary, open questions
- `executor`: one scoped slice, one explicit verify handoff
- `reviewer`: findings first, coverage gaps, residual risk
- `operator`: queue health, worker health, inbox clarity

### Team runtime rules
- Worker ids must map to real catalog roles.
- Task claims must map to a real worker.
- Every completion should generate a reviewable handoff.
- Every review should end in `approved`, `changes_requested`, or stay `pending` for a clear reason.
- Use inbox messages for next actions, not narration.

### Plugin and hook rules
- Prefer the first-party OMX plugin bundle when testing plugin flows.
- Treat Codex hooks as experimental. Install them when useful, but keep degraded behavior correct when `codex_hooks` is off.
- Repo-local hook installs belong in `<repo>/.codex/hooks.json`.
- Personal hook installs belong in `~/.codex/hooks.json`.

### Product boundary
OMX v2 is Codex-native. Do not reintroduce `claude_code*` tools or the old Codex-to-Claude split unless the repo owner explicitly chooses to build an adapter later.
