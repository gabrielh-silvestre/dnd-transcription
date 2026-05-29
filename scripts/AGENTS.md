<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-05-28 -->

# scripts

## Purpose
Standalone verification scripts run outside the Jest suite. They drive the real CLI entrypoint end-to-end with stubbed providers to validate behavior that's awkward to assert in a unit test (e.g. very long inputs producing many chunks).

## Key Files
| File | Description |
|------|-------------|
| `verify-long-input.ts` | Drives `runCli()` with a `StubMediaSegmenter` configured for synthetic >3h media and the `FakeTranscriber`; verifies job creation, chunk manifest generation, and merged markdown output. Exits `0` on success, non-zero on failure. |

## For AI Agents

### Working In This Directory
- Runs from compiled output: `npm run verify:long-input` (builds first, then `node dist/scripts/verify-long-input.js`).
- This is **not** a Jest test — there is no `afterEach` cleanup. It writes to an OS temp dir; cleanup relies on the OS, not the test harness.
- Keep these scripts dependency-injected against the same seams the CLI exposes (`runCli` factories), so they stay offline and deterministic.

### Common Patterns
- Reuses `tests/helpers/stub-media-segmenter.ts` and `src/infrastructure/providers/fake-transcriber.ts` to avoid ffmpeg and network.

## Dependencies

### Internal
`src/cli/main.ts` (`runCli`), `src/infrastructure/providers/fake-transcriber.ts`, `tests/helpers/stub-media-segmenter.ts`.

### External
node `fs/promises`, `timers/promises`. No Jest.
