---
title: "LLM Refinement Playbook"
category: foundation
summary: "Rigid instructions for converting deterministic evidence into durable refined wiki pages."
source_paths:
  - "README.md"
  - "AGENTS.md"
  - "CLAUDE.md"
  - "src/wiki"
  - ".omx/plans"
  - ".claude/project-context"
  - ".agents/skills"
  - ".claude/skills"
---
# LLM Refinement Playbook

This file governs how an LLM should turn deterministic evidence into durable code documentation.

## Non-negotiable boundaries

- Never edit `docs/wiki/evidence/`. It is deterministic output owned by the CLI.
- Write all synthesis into `docs/wiki/pages/`.
- Do not treat deterministic evidence as automatically true forever. Verify against raw code when behavior, edge cases, or ownership are ambiguous.
- If evidence is stale, regenerate it before refining.

## Mandatory refinement sequence

1. Read [Schema](./schema.md), [Index](./index.md), [Refined Pages Index](./pages/index.md), and [Evidence Index](./evidence/index.md).
2. Run `npm run wiki -- query --query "<terms>"` for the topic being refined.
3. Read existing refined pages under `docs/wiki/pages/` first to avoid duplicate or conflicting narratives.
4. Read the supporting evidence pages under `docs/wiki/evidence/`.
5. Verify disputed or behavior-sensitive claims against raw sources in `src/`, `tests/`, `README.md`, `.omx/plans/`, or `.claude/project-context/`.
6. Create or update the refined page in `docs/wiki/pages/`.
7. Update `docs/wiki/pages/index.md` with a one-line summary for the refined page.
8. Append a log entry using the format `## [YYYY-MM-DD] refine | <topic>`.

## Required frontmatter for every refined page

```yaml
---
title: "<Page title>"
summary: "<One-line summary>"
status: "draft" | "reviewed"
evidence_paths:
  - "../evidence/<path>.md"
source_paths:
  - "src/..."
  - "tests/..."
last_refined_on: "YYYY-MM-DD"
---
```

## Required page sections

- `# <Title>`
- `## What It Covers`
- `## How It Works`
- `## Evidence`
- `## Open Questions`
- `## Related Pages`

## Claim discipline

- Every non-trivial claim must be justified by at least one evidence page and one raw source path.
- If a statement is an inference rather than an explicit fact, label it as `Inference:`.
- If the evidence is incomplete, record the gap under `Open Questions` instead of presenting a confident claim.
- Prefer stable architecture, boundaries, data contracts, and operational invariants over incidental implementation trivia.
- When two sources conflict, describe the conflict explicitly and identify which raw file needs confirmation.

## Mutation rules

- Add new refined pages only when the topic is durable and likely to be reused.
- Prefer updating an existing refined page instead of creating overlapping pages.
- Keep links relative so the wiki remains browsable in editors like Obsidian.
- Keep `docs/wiki/pages/index.md` current; it is the catalog for refined synthesis.
- Keep `log.md` chronological and append-only.

## Repo-local skills

- `wiki-refinement-pass`: full refinement pass from evidence into refined pages.
- `wiki-promote-answer`: promote a durable answer or comparison into the wiki.
- `wiki-refinement-audit`: review refined pages for playbook compliance and stale claims.

## When not to refine

- Do not create refined pages for one-off ephemeral chat answers.
- Do not restate deterministic evidence verbatim when no synthesis is needed.
- Do not create a refined page if the evidence layer is clearly stale and has not been regenerated yet.
