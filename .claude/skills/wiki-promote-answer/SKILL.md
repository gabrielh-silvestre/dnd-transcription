---
name: wiki-promote-answer
description: Promote a useful answer, comparison, or analysis from chat into docs/wiki/pages. Use when asked to save, file, persist, or turn a conversation result into durable code-wiki documentation without redoing the entire refinement pass from scratch.
---

# Wiki Promote Answer

Use this skill when a chat answer should become durable project knowledge.

## Load First

- `docs/wiki/refinement-playbook.md`
- `docs/wiki/pages/index.md`
- `docs/wiki/evidence/index.md`

## Hard Rules

- Do not promote ephemeral or one-off answers.
- Merge into an existing refined page when the topic already exists.
- Unsupported claims must become `Open Questions`, not assertions.
- Never write promoted content into `docs/wiki/evidence/`.

## Workflow

1. Decide whether the answer is durable enough to belong in the wiki.
2. Run `npm run wiki -- query --query "<terms>"` and inspect existing refined pages.
3. Read the evidence pages and raw source files needed to support the answer.
4. Either update the existing refined page or create a new page under `docs/wiki/pages/`.
5. Keep the page compliant with the required frontmatter and sections in `docs/wiki/refinement-playbook.md`.
6. Update `docs/wiki/pages/index.md`.
7. Append `## [YYYY-MM-DD] refine | <topic>` to `docs/wiki/log.md`.
8. Run `npm run wiki -- lint`.

## Finish Only When

- the promoted answer is now durable wiki content
- overlap with existing refined pages was resolved
- index, log, and lint are all current
