<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-05-28 -->

# shared

## Purpose
Path resolution and layout constants for the code wiki — the single definition of where every wiki file/directory lives, used by both the application and CLI layers.

## Key Files
| File | Description |
|------|-------------|
| `wiki-paths.ts` | `CodeWikiPaths` interface (rootDir, evidenceDir, evidenceModulesDir, evidenceWorkflowsDir, pagesDir, reportsDir, schemaPath, refinementPlaybookPath, indexPath, evidenceIndexPath, refinedIndexPath, logPath, lintReportPath); `resolveCodeWikiPaths(repoRoot, wikiRoot)`; path converters `toPosixPath` / `relativeToWikiRoot` / `relativeToRepoRoot`; constant `DEFAULT_CODE_WIKI_ROOT = "docs/wiki"`. |

## For AI Agents

### Working In This Directory
- `DEFAULT_CODE_WIKI_ROOT = "docs/wiki"` is the default; commands/tests can override it with `--root`.
- All resolved paths are absolute; functions take `repoRoot` so they're dependency-injectable in tests.
- `toPosixPath()` normalizes `\` → `/` for cross-platform consistency in generated output.
- Evidence is organized into `modules/` and `workflows/` subdirectories — keep that split if you add path entries.

## Dependencies

### Internal
None (only node built-ins).

### External
node `path` (join, relative, resolve).
