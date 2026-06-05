---
title: "CLI on Commander (ADR)"
summary: "Both CLIs now parse argv with commander@15 inside the legacy parser classes, preserving flags, exit codes, types, and test seams."
status: "reviewed"
evidence_paths:
  - "../evidence/modules/cli.md"
  - "../evidence/architecture.md"
source_paths:
  - "src/cli/cli-argument-parser.ts"
  - "src/wiki/cli/wiki-argument-parser.ts"
  - "tests/unit/parse-args.test.ts"
  - "tests/unit/wiki/wiki-argument-parser.test.ts"
  - ".omc/plans/commander-cli-migration.md"
last_refined_on: "2026-06-05"
---
# CLI on Commander (ADR)

## What It Covers

The decision (2026-06-05, branch `refactor/use-commander-cli`) to replace the manual argv scanning in `CliArgumentParser` and `WikiArgumentParser` with `commander@^15` as the internal parsing engine — "Opção A (encapsulada)" from `.omc/plans/commander-cli-migration.md`. The swap is intentionally invisible outside the two parser files: public types (`CliOptions`, `CliParseResult`, `WikiCliParseResult`), flag names/defaults, `ValidationError` on usage errors, numeric exit codes, and the DI seams consumed by tests all stay identical.

## How It Works

- Each `parse(argv)` call builds a fresh `Command` with `.exitOverride()` and `.configureOutput()` (help captured into a buffer, stderr silenced), so no code path ever calls `process.exit` and `runCli`/`runWikiCli` keep returning numbers.
- Errors are discriminated by `CommanderError.exitCode`: `0` (help/version) returns `{ kind: "help", text }`; anything else is rethrown as `ValidationError` (scope `"wiki"` for the wiki CLI).
- Help is commander-generated; the legacy `CLI_USAGE`/`WIKI_USAGE` constants remain exported and are appended via `.addHelpText("after", ...)`, so rendered help is a superset of the old text. The two parser unit tests assert help semantically (`toContain`) instead of literally.
- Repeatable flags (`--input`, `--source`) use collector callbacks with `[]` defaults; the ≥1 requirement is validated post-parse (never `requiredOption`, which a collector default would satisfy vacuously) with the original error messages.
- Positive integers go through a custom `argParser` throwing `InvalidArgumentError` with the flag name in the message (preserves `toThrow(/file-concurrency/)`-style asserts); `--cleanup-policy` uses `Option.choices(["on-success", "keep"])`.
- The wiki CLI registers `init/refresh/ingest/query/lint` as subcommands whose sync `.action()` callbacks capture the existing discriminated union; `exitOverride`/`configureOutput`/`helpOption` are applied explicitly per subcommand (root inheritance exists but is not relied upon). Empty argv is normalized to `["--help"]` because commander's native no-subcommand path exits `1`, while the legacy contract is help with exit `0`. The implicit `help` subcommand is disabled (`helpCommand(false)`).

## Evidence

- `../evidence/modules/cli.md` and `../evidence/architecture.md` (re-ingested 2026-06-05 after the swap).
- Full suite green post-migration: 24 suites / 101 tests, with `tests/unit/transcription-cli-application.test.ts` and all 6 integration suites passing **unmodified** — the strongest proof that exit codes (`0/1/2`), seams, and flag compatibility were preserved.
- Smoke checks: `--help` on both CLIs exits `0` writing only to stdout; `--cleanup-policy x`, `ingest` without `--source`, and `ingest --bogus` (error inside a subcommand) all exit `1` without `process.exit`.

## Open Questions

- Accepted debt (plan A3): the wiki CLI double-dispatches — commander routes to an `.action()` that only captures the union, and `WikiCliApplication` still does `switch (parsed.kind)`. If the application seam is ever redesigned (plan options B/C), actions could call `CodeWikiService` directly and the switch would disappear.

## Related Pages

- [Module Boundaries](./module-boundaries.md)
- [Architecture Overview](./architecture.md)
- [Testing Strategy](./testing-strategy.md)
