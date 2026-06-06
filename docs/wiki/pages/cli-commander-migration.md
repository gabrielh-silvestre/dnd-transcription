---
title: "CLI on Commander (ADR)"
summary: "Both CLIs now parse argv with commander@15 inside the legacy parser classes, preserving flags, exit codes, and types. Error messages are re-translated to Portuguese by the shared translateCommanderError helper in src/shared/commander-helpers.ts. Minimum Node requirement raised to 22.12.0."
status: "reviewed"
evidence_paths:
  - "../evidence/modules/cli.md"
  - "../evidence/architecture.md"
source_paths:
  - "src/cli/cli-argument-parser.ts"
  - "src/wiki/cli/wiki-argument-parser.ts"
  - "src/shared/commander-helpers.ts"
  - "tests/unit/parse-args.test.ts"
  - "tests/unit/wiki/wiki-argument-parser.test.ts"
  - "tests/unit/commander-helpers.test.ts"
  - ".omc/plans/commander-cli-migration.md"
last_refined_on: "2026-06-05"
---
# CLI on Commander (ADR)

## What It Covers

The decision (2026-06-05, branch `refactor/use-commander-cli`) to replace the manual argv scanning in `CliArgumentParser` and `WikiArgumentParser` with `commander@^15` as the internal parsing engine — "Opção A (encapsulada)" from `.omc/plans/commander-cli-migration.md`. The swap is intentionally invisible outside the two parser files: public types (`CliOptions`, `CliParseResult`, `WikiCliParseResult`), flag names/defaults, `ValidationError` on usage errors, numeric exit codes, and the DI seams consumed by tests all stay identical. Error messages are **re-translated to Portuguese** by a shared helper (`translateCommanderError` in `src/shared/commander-helpers.ts`) — they are not preserved automatically by commander. Minimum Node version raised to **22.12.0** (required by `commander@15`; see Node requirement below).

## How It Works

- Each `parse(argv)` call builds a fresh `Command` with `.exitOverride()` and `.configureOutput()` (help captured into a buffer, stderr silenced), so no code path ever calls `process.exit` and `runCli`/`runWikiCli` keep returning numbers.
- Errors are discriminated by **`error.code`** (the semantic string field on `CommanderError`): codes `commander.help` and `commander.helpDisplayed` are both treated as help and return `{ kind: "help", text }`; all other codes are translated to Portuguese by `translateCommanderError` in `src/shared/commander-helpers.ts` and rethrown as `ValidationError` (scope `"wiki"` for the wiki CLI, default `"cli"` for the transcribe CLI). Note: `commander.help` carries `exitCode 1` on the `wiki --` path — this was the root bug; treating both help codes uniformly fixes it.
- **Portuguese re-translation via shared module.** Because `commander@15` does not expose `error.cause` and does not populate `nestedError` (verified: `error.cause === undefined`, `error.nestedError === undefined` for all tested codes), the original `InvalidArgumentError` thrown by custom argParsers is not recoverable through any structured channel. Therefore `translateCommanderError` **reconstructs 100% of the Portuguese string from structured fields** (the `error.code` + the flag name extracted and normalized from `error.message` via `/option '([^']+)'/` + `.split(" ")[0]` + flag category tables), never reading the English substring after `is invalid. `. The category tables `INTEGER_FLAGS` and `STRING_VALUE_FLAGS` live in `src/shared/commander-helpers.ts` and enumerate every flag whose argParser produces `commander.invalidArgument`, enabling deterministic disambiguation of the three sub-families that share the same code (choices, positive-integer, anti-`--`). This is a named tradeoff (T2): the shared helper gains knowledge of flag categories; accepted because it is minimal, deterministic, and unit-testable.
- **`commander.unknownCommand` is handled in the wiki parser, not in the shared helper.** The wiki parser intercepts `error.code === "commander.unknownCommand"` before delegating to `translateCommanderError` and throws `ValidationError("Comando wiki desconhecido: ${cmd}", "wiki")` directly. This keeps the shared helper free of parser-specific strings (single responsibility).
- Help is commander-generated; the legacy `CLI_USAGE`/`WIKI_USAGE` constants remain exported and are appended via `.addHelpText("after", ...)`, so rendered help is a superset of the old text. The two parser unit tests assert help semantically (`toContain`) instead of literally.
- Repeatable flags (`--input`, `--source`) use a single composed argParser `collectRejectingDashDash` (validates the anti-`--` rule then appends to the accumulator) with `[]` defaults; the ≥1 requirement is validated post-parse (never `requiredOption`, which a collector default would satisfy vacuously) with the original Portuguese error messages. Non-repeatable string flags (`--output`, `--provider`, `--root`, `--query`, etc.) use `createRejectDashDashParser`. Using a single argParser per option is required — a second argParser would silently overwrite the first, losing collection or defaults.
- **Values starting with `--` are rejected on all string flags** (parity with `main`). For integer flags this is already covered by the positive-integer argParser (`--` is not an integer, triggers `commander.invalidArgument`). For string flags, `createRejectDashDashParser(flag)` and `collectRejectingDashDash(flag)` throw `InvalidArgumentError("Flag ${flag} exige um valor.")` when `value.startsWith("--")`, which `translateCommanderError` re-translates via `STRING_VALUE_FLAGS`.
- Positive integers go through a custom `argParser` throwing `InvalidArgumentError` with the flag name in the message (preserves `toThrow(/file-concurrency/)`-style asserts); `--cleanup-policy` uses `Option.choices(["on-success", "keep"])`.
- The wiki CLI registers `init/refresh/ingest/query/lint` as subcommands whose sync `.action()` callbacks capture the existing discriminated union; `exitOverride`/`configureOutput`/`helpOption` are applied explicitly per subcommand (root inheritance exists but is not relied upon). Empty argv is normalized to `["--help"]` because commander's native no-subcommand path exits `1`, while the legacy contract is help with exit `0`. The implicit `help` subcommand is disabled (`helpCommand(false)`).

### Error precedence change (C3-05)

With `commander@15`, validation during `parse` takes precedence over post-parse checks. Concretely: if both `--cleanup-policy` has an invalid value AND `--input` is absent, the first error is the `--cleanup-policy` one (fired during parse), not the `--input` missing-flag check (which runs post-parse). Both messages are in Portuguese; the order change is intentional and documented. Alternative: a pre-check of `--input` before `program.parse` would restore the original order but reintroduces manual parsing logic outside commander — rejected as poor cost/benefit. This precedence is covered by a dedicated test.

### Node 22.12.0 requirement

`commander@15.0.0` declares `engines: { node: ">=22.12.0" }` (verified in `node_modules/commander/package.json`). `package.json` `engines.node` is set to `>=22.12.0` and `@types/node` to `^22.0.0`. A `.nvmrc` file (`22.12.0`) provides the only runtime safeguard in the absence of CI. **Accepted risk:** there is no `.github/` CI in this repository; `engines.node` is declarative only (does not block execution). The verification that the build and tests pass on the target Node version depends on manual enforcement via `nvm use`. Creating CI already pinned to Node `>=22.12.0` remains an explicit accepted risk until CI is added.

## Evidence

- `../evidence/modules/cli.md` and `../evidence/architecture.md` (re-ingested 2026-06-05 after the swap).
- Full suite green post-migration (pre-adjustment baseline: 24 suites / 101 tests), with `tests/unit/transcription-cli-application.test.ts` and all 6 integration suites passing **unmodified** — the strongest proof that exit codes (`0/1/2`), seams, and flag compatibility were preserved. Test count will increase after the C3-08 additions (commander-helpers.test.ts + new cases in parse-args and wiki-argument-parser); the lead reconfirms the final count at the gate.
- Smoke checks: `--help` on both CLIs exits `0` writing only to stdout; `--cleanup-policy x`, `ingest` without `--source`, and `ingest --bogus` (error inside a subcommand) all exit `1` without `process.exit`.

## Open Questions

- Accepted debt (plan A3): the wiki CLI double-dispatches — commander routes to an `.action()` that only captures the union, and `WikiCliApplication` still does `switch (parsed.kind)`. If the application seam is ever redesigned (plan options B/C), actions could call `CodeWikiService` directly and the switch would disappear.

## Related Pages

- [Module Boundaries](./module-boundaries.md)
- [Architecture Overview](./architecture.md)
- [Testing Strategy](./testing-strategy.md)
