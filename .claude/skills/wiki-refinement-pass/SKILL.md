---
name: wiki-refinement-pass
description: Refine deterministic code-wiki evidence into durable synthesized pages under docs/wiki/pages. Use when asked to create or update code documentation from docs/wiki/evidence, to refine architecture/module/workflow notes, or to perform a full wiki refinement pass that must also update pages/index.md and log.md.
---

# Wiki Refinement Pass

Use this skill when the task is to turn deterministic evidence into durable project documentation.

## Load First

- `docs/wiki/index.md`
- `docs/wiki/schema.md`
- `docs/wiki/refinement-playbook.md`
- `docs/wiki/pages/index.md`
- `docs/wiki/evidence/index.md`

## Hard Rules

- Never edit `docs/wiki/evidence/`.
- If evidence is stale, regenerate it with `npm run wiki -- ingest ...` or `npm run wiki -- refresh` before refining.
- Prefer updating an existing page in `docs/wiki/pages/` over creating an overlapping page.
- Every durable claim must be backed by both evidence pages and raw source paths.

## Workflow

1. Run `npm run wiki -- query --query "<terms>"` for the topic.
2. Read existing refined pages first, then the supporting evidence pages.
3. Verify behavior-sensitive or ambiguous claims against raw files in `src/`, `tests/`, `README.md`, `.omx/plans/`, or `.claude/project-context/`.
4. Create or update the refined page in `docs/wiki/pages/` using the frontmatter and required sections from `docs/wiki/refinement-playbook.md`.
5. Update `docs/wiki/pages/index.md` with a one-line summary.
6. Append `## [YYYY-MM-DD] refine | <topic>` to `docs/wiki/log.md`.
7. Run `npm run wiki -- lint`.

## Finish Only When

- the refined page synthesizes the evidence instead of restating it verbatim
- `docs/wiki/pages/index.md` and `docs/wiki/log.md` were updated
- `npm run wiki -- lint` passes, or the remaining issue is documented explicitly
