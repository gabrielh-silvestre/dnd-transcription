<!-- Generated: 2026-05-28 | Updated: 2026-06-06 -->

# dnd-transcription

## Purpose
TypeScript CLI that chunks long media files (e.g. multi-hour D&D session recordings), transcribes each chunk through pluggable providers (OpenAI Whisper, OpenAI/Azure audio transcription, or a fake provider for tests), and merges the per-chunk markdown into a single transcript. The pipeline is resumable, fault-tolerant (partial-failure aware), and built on a hexagonal architecture. The repo also ships a self-contained **code wiki** (`src/wiki/` + `docs/wiki/`) that documents the codebase itself.

## Key Files
| File | Description |
|------|-------------|
| `package.json` | Scripts (`build`, `test`, `transcribe`, `wiki`); runtime deps (`commander`, `openai`); dev deps (`jest`, `typescript`). ESM (`"type": "module"`). Node `>=22.12.0`. |
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
- `commander` (^15) — argv parsing engine behind both CLIs (`transcribe` + `wiki`); raises the minimum Node to `>=22.12.0`.
- `openai` (^6.x) — Whisper / audio transcription client (also `AzureOpenAI`).
- `typescript` (^5.8) — strict compilation, the primary correctness gate.
- `jest` (^30) — test runner (run via `--experimental-vm-modules`).
- `ffmpeg` / `ffprobe` — external CLIs for media segmentation (not npm; must be on PATH for real transcription, stubbed in tests).

<!-- MANUAL: The section below is hand-authored agent-harness operating guidance (oh-my-claudecode / OMC). It is preserved across deepinit regenerations. -->

## OMC operating model (preserved, harness-specific)

You are working inside a repo driven with oh-my-claudecode (OMC), a multi-agent orchestration layer for Claude Code. Skills are invoked as `/oh-my-claudecode:<name>`.

### Default operating model
- For broad or risky work, explore first then plan: route unclear requirements through `deep-interview`, and turn broad work into durable slices with `plan` / `ralplan`.
- Use `ultrawork` for high-throughput parallel execution and `autopilot` / `ralph` for autonomous loops; narrow to a single agent when the task is small.
- Escalate to `team` only when parallel durable execution is worth the coordination overhead.
- Delegate specialized work to the right agent instead of doing everything in the main thread; keep authoring and review in separate passes.
- Keep `.omc/` honest. If a mode is active, there should be artifacts or tasks proving it.

### Durable artifacts
Maintain these when relevant: `.omc/plans/*.md`, `.omc/research/*.md`, `.omc/specs/*.md`, `.omc/handoffs/*.md`, `.omc/logs/`, `.omc/state/` (incl. `.omc/state/sessions/{sessionId}/`), `.omc/notepad.md`, `.omc/project-memory.json`. A legacy `.omx/` tree from a previous Codex-based harness still exists as read-only history; note `.omx/plans/` is also a code-wiki ingest source (see the code wiki contract in `CLAUDE.md`).

### Agent roles
- `architect`: boundaries, risks, sequencing (read-only)
- `planner`: execution slices, requirements, verification map
- `explore`: codebase search and file/pattern discovery
- `executor`: one scoped slice of implementation (`model=opus` for complex work)
- `code-reviewer` / `critic`: findings-first review, coverage gaps, residual risk
- `verifier`: evidence-based completion checks before claiming done
- `document-specialist`: SDK / framework / API docs lookup before implementing

### Verification and review rules
- Verify before claiming completion; size the check to the risk (haiku → sonnet → opus for large/security work).
- Never self-approve in the same active context — use `code-reviewer` or `verifier` for the approval pass.
- Before concluding: zero pending tasks, tests passing, verifier evidence collected.

### Hooks and persistence
- Hooks inject `<system-reminder>` tags; treat `[MAGIC KEYWORD: ...]` as an instruction to invoke the named skill, and `The boulder never stops` as ralph/ultrawork still active.
- Kill switches: `DISABLE_OMC`, `OMC_SKIP_HOOKS`.

### Product boundary
This repo is now Claude-Code-native (OMC). The earlier oh-my-codex split (`.omx/`, `.codex/`) is legacy; do not reintroduce Codex-specific tooling unless the repo owner explicitly chooses to.
