<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-06-06 -->

# cli

## Purpose
The wiki subsystem's command-line interface: parses argv, dispatches to `CodeWikiService` methods, renders results, and serves as the `npm run wiki` entrypoint (`dist/src/wiki/cli/main.js`).

## Key Files
| File | Description |
|------|-------------|
| `main.ts` | Entrypoint; exports `runWikiCli(argv, dependencies)` and `main(argv)`; ESM-main detection; delegates to `WikiCliApplication.run()`. |
| `wiki-argument-parser.ts` | `WikiArgumentParser.parse(argv)` → `WikiCliParseResult` union (Init/Refresh/Ingest/Query/Lint commands or Help) via `commander` subcommands; defines `WIKI_USAGE` and validates flags. |
| `wiki-cli-application.ts` | `WikiCliApplication.run(argv)` — orchestrates parse → dispatch → render; `renderMutationResult` / `renderQueryResult` / `renderLintResult`; error handling and exit codes. |

## For AI Agents

### Working In This Directory
- **Command dispatch** pattern-matches on the parse result's `kind` to route to the right service method.
- **Dependency injection**: accepts optional `WikiCliDependencies` (createLogger, cwd) and `WikiCliServices` (argumentParser, codeWikiService, writeStdout) — preserve these seams for testing.
- Exit codes: `0` success, `1` error (exceptions logged before exit).
- Help/usage text and messages are in **Portuguese** (e.g. "wiki init concluído", "Comando wiki desconhecido").
- `ingest` requires ≥1 `--source <path>` (repeatable); `query` requires `--query "<terms>"` with optional `--limit`.

### Testing Requirements
`tests/unit/wiki/wiki-argument-parser.test.ts` covers parsing of ingest/query/help, source paths, and custom `--root`.

## Dependencies

### Internal
`./wiki-argument-parser.ts`, `src/wiki/application/code-wiki-service.ts`, `src/wiki/shared/wiki-paths.ts` (`DEFAULT_CODE_WIKI_ROOT`), `src/shared/` (`createLogger`, `ValidationError`, `commander-helpers.ts`).

### External
node `path` (`resolve`), `url` (`pathToFileURL`); `commander`.
