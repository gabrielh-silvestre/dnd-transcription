<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-05-28 -->

# wiki

## Purpose
Unit tests for the code-wiki subsystem (`src/wiki/`): the wiki service's file collection / evidence generation and the wiki CLI argument parser. Like the rest of the suite, these are offline and use temp-dir fixtures.

## Key Files
| File | Description |
|------|-------------|
| `code-wiki-service.test.ts` | Builds a fixture repo tree (`src/cli`, `src/application`, `src/domain/entities`, …) with dummy `.ts` files in a temp dir, then asserts snapshot/file-collection logic, evidence generation, markdown rendering, and playbook scaffolding. |
| `wiki-argument-parser.test.ts` | Validates `WikiArgumentParser`: ingest/query/help commands, repeated `--source` paths, and custom `--root` resolution. |

## For AI Agents

### Working In This Directory
- Service tests are **filesystem-heavy**: they materialize a fake project layout in a temp dir and rely on `afterEach` cleanup. Use `createTempDir()`.
- The fixture directory structure **mirrors the real `src/` layout** — if you restructure `src/`, these fixtures (and the collection assertions) may need updating.
- Parser tests don't mock the parser; they assert the returned `WikiCliParseResult` union directly.

### Testing Requirements
`npm run test:file -- dist/tests/unit/wiki/code-wiki-service.test.js` (builds first). Keep fixtures small and deterministic.

## Dependencies

### Internal
`src/wiki/application/code-wiki-service.ts`, `src/wiki/cli/wiki-argument-parser.ts`, `tests/helpers/temp-dir.ts`.

### External
`jest`, node `fs/promises`.
