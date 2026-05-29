<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-05-28 -->

# helpers

## Purpose
Reusable test utilities: temp-directory lifecycle management and a stub `MediaSegmenter` so unit/integration tests (and `scripts/`) can exercise the pipeline offline, without real ffmpeg or media files.

## Key Files
| File | Description |
|------|-------------|
| `temp-dir.ts` | `createTempDir()` (via `mkdtemp`) and `cleanupTempDirs()`; tracks every created dir in a module-level Set so `setup/jest.setup.ts` can clean them after each test. |
| `stub-media-segmenter.ts` | `StubMediaSegmenter` implementing the `MediaSegmenter` port; builds a configurable fake `ChunkManifest` (duration/chunk layout) and writes placeholder audio files — the primary way to avoid ffmpeg/network in tests. |

## For AI Agents

### Working In This Directory
- Test doubles are **hand-written classes implementing the real port interface** — not `jest.mock()`. Keep them in sync with the port signatures in `src/domain/ports/`.
- Anything that creates files should go through `createTempDir()` so cleanup is automatic; otherwise you leak fs state.
- These helpers are imported by `tests/` *and* by `scripts/verify-long-input.ts` — changing their API affects both.

## Dependencies

### Internal
`src/domain/entities/chunk-manifest.ts`, `src/domain/ports/media-segmenter.ts`, `src/shared/paths.ts`.

### External
node `fs/promises` (mkdtemp, rm, mkdir, writeFile).
