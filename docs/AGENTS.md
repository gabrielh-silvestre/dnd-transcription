<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-05-28 -->

# docs

## Purpose
Home of the repo-local **code wiki** under `docs/wiki/` — the persistent documentation layer that sits between agents and the raw code. It is generated and maintained by the `src/wiki/` CLI (`npm run wiki -- <init|refresh|ingest|query|lint>`). The wiki documents the codebase itself (not the contents of transcriptions).

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `wiki/` | The code wiki. Has its own contract defined by `wiki/schema.md` and `wiki/refinement-playbook.md`. |

## Wiki layout (`docs/wiki/`)
| Path | Role |
|------|------|
| `index.md` | Top-level catalog / entry point — read this first. |
| `schema.md` | Page conventions and frontmatter contract. |
| `refinement-playbook.md` | Rules for refining evidence into durable pages. |
| `evidence/` | **Deterministic, CLI-generated** raw material. Read-only — never hand-edit; regenerate via `npm run wiki -- ingest ...` / `refresh`. Split into `evidence/modules/` and `evidence/workflows/`. |
| `pages/` | Durable refinement layer (LLM/human-authored synthesis). Edit here; keep `pages/index.md` current. |
| `log.md` | Append-only mutation log written by wiki commands. |
| `reports/` | Lint and other generated reports. |

## For AI Agents

### Working In This Directory
- **Do not hand-edit `docs/wiki/evidence/`** — it is fully regenerated and your edits will be overwritten. Regenerate it through the wiki CLI instead.
- **Do edit `docs/wiki/pages/`** for durable synthesis, and update `docs/wiki/pages/index.md` + append to `docs/wiki/log.md`.
- Before broad code exploration, query the wiki: `npm run wiki -- query --query "<terms>"`.
- Periodically run `npm run wiki -- lint` to catch broken links, missing coverage, and orphan pages.
- The generator/CLI logic lives in `src/wiki/` (see `src/wiki/AGENTS.md`); change documentation *behavior* there, change documentation *content* here.

## Dependencies

### Internal
Generated and consumed by `src/wiki/`. The repo-local refinement skills in `.agents/skills/` and `.claude/skills/` (`wiki-refinement-pass`, `wiki-promote-answer`, `wiki-refinement-audit`) operate on this directory.
