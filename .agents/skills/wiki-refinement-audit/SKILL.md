---
name: wiki-refinement-audit
description: Audit refined wiki pages for playbook compliance, unsupported claims, stale evidence, and missing links. Use when asked to review docs/wiki/pages quality, verify refinement discipline, or clean up a refined wiki after multiple edits.
---

# Wiki Refinement Audit

Use this skill when the task is to review or repair the quality of refined wiki pages.

## Load First

- `docs/wiki/schema.md`
- `docs/wiki/refinement-playbook.md`
- `docs/wiki/pages/index.md`
- `docs/wiki/evidence/index.md`

## Audit Checklist

- every refined page has the required frontmatter fields
- every refined page has the required sections
- `evidence_paths` and `source_paths` point to real files
- important claims are supported by evidence or explicitly marked as inference/open question
- `docs/wiki/pages/index.md` covers the refined pages that exist
- `docs/wiki/log.md` reflects the refinement work that happened

## Workflow

1. Run `npm run wiki -- lint`.
2. Inspect `docs/wiki/pages/index.md` and enumerate the refined pages.
3. Review each refined page against `docs/wiki/refinement-playbook.md`.
4. Patch missing frontmatter, missing sections, broken links, and unsupported claims.
5. Update `docs/wiki/pages/index.md` and `docs/wiki/log.md` if the audit caused durable page changes.
6. Run `npm run wiki -- lint` again.

## Finish Only When

- the refined pages comply with the playbook
- broken links or indexing gaps are fixed or explicitly reported
- remaining stale-evidence risks are called out clearly
