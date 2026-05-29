<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-05-28 -->

# setup

## Purpose
Jest global setup, wired via `setupFilesAfterEnv` in `jest.config.cjs`. Runs in the Node test environment to keep the filesystem clean between tests.

## Key Files
| File | Description |
|------|-------------|
| `jest.setup.ts` | Registers an `afterEach` hook (from `@jest/globals`) that calls `cleanupTempDirs()` from `tests/helpers/temp-dir.ts`, removing every temp dir created during a test. |

## For AI Agents

### Working In This Directory
- Loaded by Jest from the **compiled** path `dist/tests/setup/jest.setup.js` — rebuild after editing or Jest won't see the change.
- Single responsibility: post-test temp-dir cleanup. If you add global setup (env defaults, fake timers), keep it minimal and deterministic so suites stay independent.

## Dependencies

### Internal
`tests/helpers/temp-dir.ts` (`cleanupTempDirs`).

### External
`@jest/globals` (`afterEach`).
