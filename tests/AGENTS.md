<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-05-28 -->

# tests

## Purpose
Jest test suites for the transcription pipeline and the code wiki. Tests are **offline-first**: all external services (OpenAI SDK, ffmpeg/ffprobe, network) are replaced with hand-written stubs/fakes — there are no live network calls and no real ffmpeg dependency. Tests compile from TypeScript and run from `dist/tests/`.

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `unit/` | Fast, focused tests of entities, parsers, config builders, adapters (see `unit/AGENTS.md`) |
| `unit/wiki/` | Unit tests for the code-wiki subsystem (see `unit/wiki/AGENTS.md`) |
| `integration/` | Cross-layer end-to-end runs (CLI → use case → providers) with stubs (see `integration/AGENTS.md`) |
| `helpers/` | Shared test doubles and temp-dir utilities (see `helpers/AGENTS.md`) |
| `setup/` | Jest global setup (post-test cleanup) (see `setup/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- **Build before test.** Jest runs compiled `.js` from `dist/tests/`, not the `.ts` here. Use `npm test`, `npm run test:unit`, `npm run test:integration`, or `npm run test:file -- dist/tests/.../<name>.test.js` (each builds first).
- **No `jest.mock()` / `jest.fn()` magic.** Test doubles are plain classes/object-literals implementing the same port interfaces as production code. You cannot call mock-introspection methods on them; assert via captured inputs the stub records.
- **Temp dirs auto-clean.** Use `createTempDir()` from `helpers/temp-dir.ts`; `setup/jest.setup.ts` cleans them via `afterEach`. Don't leave fixtures in the working tree.
- **Portuguese test descriptions** are the norm — keep them consistent.

### Testing Requirements
- `testTimeout` is 30s; integration tests stay within it by using stubs (no real I/O bottlenecks).
- Config builders generate JSON `transcriberSignature` strings that tests assert **exactly** — refactoring config object shape will break signature assertions; update them deliberately.

### Common Patterns
- Unit = one module in isolation; Integration = multiple layers wired through `runCli()` / use cases with injected fakes (`StubMediaSegmenter`, custom `Transcriber`s, mocked OpenAI client object literals).
- The ffmpeg integration test fakes ffmpeg/ffprobe by writing executable (`0o755`) shell scripts into a temp dir.

## Dependencies

### Internal
Exercises `src/cli/`, `src/application/`, `src/domain/`, `src/infrastructure/`, `src/shared/`, and `src/wiki/`.

### External
`jest` / `@jest/globals`, node `fs/promises` & `timers/promises`. `openai` and `ffmpeg` are stubbed, never invoked for real.
