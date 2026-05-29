<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-05-28 -->

# application

## Purpose
Core logic of the code-wiki subsystem. Collects a snapshot of the repository's file inventory, renders deterministic evidence pages from page definitions, and performs the file I/O behind the wiki commands (init/refresh/ingest/query/lint). This is the layer that actually writes `docs/wiki/evidence/` and reads/searches the wiki tree.

## Key Files
| File | Description |
|------|-------------|
| `code-wiki-service.ts` | `CodeWikiService` — public methods `init()`, `refresh()`, `ingest()`, `query()`, `lint()`. Handles snapshot collection, evidence/log file I/O, markdown parsing, search, and lint; returns `CodeWikiMutationResult` / `CodeWikiQueryMatch[]` / `CodeWikiLintResult`. |
| `code-wiki-page-definitions.ts` | `CodeWikiPageDefinition` interface + `CodeWikiCategory` ("foundation"|"module"|"workflow"|"quality"); `CODE_WIKI_LEGACY_GENERATED_PATHS`, `REFINED_PAGES_INDEX_SCAFFOLD`; frontmatter + page/index document generators (each page built via `build(snapshot)`). |
| `code-wiki-repo-snapshot.ts` | `CodeWikiRepoSnapshot` + `collectCodeWikiRepoSnapshot()` — captures the repo file inventory (src/test/cli/application/domain/infrastructure/provider/plan/context file lists) used as deterministic input to page generation. |

## For AI Agents

### Working In This Directory
- **`docs/wiki/evidence/` is regenerated** by init/refresh/ingest — generators here own it. **`docs/wiki/pages/`** (refinement layer) must never be overwritten by this code.
- Each command appends a structured entry (ISO date, action, result) to `docs/wiki/log.md`.
- Page output is YAML frontmatter (title, category, summary, source_paths) + body, built from the snapshot — keep generation deterministic (no timestamps that churn diffs beyond the log).
- Command names map 1:1 to service methods; keep that mapping when adding commands.

### Testing Requirements
`tests/unit/wiki/code-wiki-service.test.ts` builds a fixture repo tree in a temp dir and asserts file collection + evidence generation. Filesystem-heavy; relies on temp-dir cleanup.

## Dependencies

### Internal
`src/wiki/shared/wiki-paths.ts` (path resolution), `src/shared/errors.ts` (`ValidationError`). Intra-layer: the service calls the page definitions and snapshot collector.

### External
node `fs/promises` (mkdir, readFile, readdir, rm, stat, writeFile), `path`, `url`.
