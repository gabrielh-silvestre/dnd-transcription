<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-28 | Updated: 2026-05-28 -->

# media

## Purpose
Media segmentation adapter. Implements the `MediaSegmenter` port by shelling out to `ffmpeg`/`ffprobe`: probes the input duration, computes chunk windows, extracts each chunk as a WAV PCM 16-bit mono 16 kHz file, and returns a validated `ChunkManifest`.

## Key Files
| File | Description |
|------|-------------|
| `ffmpeg-media-segmenter.ts` | `FFmpegMediaSegmenter` (implements `MediaSegmenter`). Creates the working dir, slices the input per `chunkDurationMs` using ffmpeg with the canonical audio flags (`-vn -ac 1 -ar 16000 -sample_fmt s16`), and builds a `ChunkManifest` of 1-based chunks (index/startMs/endMs/chunkPath). |
| `ffprobe.ts` | `probeMedia()` — runs ffprobe, parses the JSON output, returns input duration in ms; throws if the duration is missing, non-finite, or ≤ 0. |

## For AI Agents

### Working In This Directory
- **Audio format is mandatory and fixed** (WAV PCM s16le, mono, 16000 Hz) for OpenAI compatibility — it comes from `src/shared/chunk-audio-format.ts`; don't diverge.
- ffmpeg/ffprobe binaries default to `"ffmpeg"`/`"ffprobe"` on PATH but are option-configurable (the integration test injects fake shell scripts).
- Chunk paths are normalized to POSIX before going into the manifest (cross-platform resume).
- ffprobe duration must parse to a finite positive number — invalid output must throw, not produce a zero-chunk manifest.

### Testing Requirements
`tests/integration/ffmpeg-media-segmenter.test.ts` fakes ffmpeg/ffprobe with executable (`0o755`) shell scripts in a temp dir — no real ffmpeg needed. Preserve that injection seam.

## Dependencies

### Internal
`src/domain/entities/chunk-manifest.ts`, `src/domain/ports/media-segmenter.ts`, `src/shared/{chunk-audio-format,process,paths}.ts`.

### External
node `fs/promises` (`mkdir`), `path`; external `ffmpeg` & `ffprobe` CLIs (via `src/shared/process.ts` `runCommand`).
