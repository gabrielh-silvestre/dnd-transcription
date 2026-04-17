import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createChunkManifest, type ChunkManifestEntry } from "../../domain/entities/chunk-manifest.js";
import { type MediaSegmenter, type SegmentMediaInput, type SegmentMediaResult } from "../../domain/ports/media-segmenter.js";
import { formatChunkAudioFileName, normalizeRelativePath } from "../../shared/paths.js";
import { runCommand } from "../../shared/process.js";
import { chunkAudioFormat } from "../../shared/chunk-audio-format.js";
import { probeMedia } from "./ffprobe.js";

export interface FFmpegMediaSegmenterOptions {
  ffmpegPath?: string;
  ffprobePath?: string;
  env?: NodeJS.ProcessEnv;
}

function toSeconds(valueMs: number): string {
  return (valueMs / 1_000).toFixed(3);
}

export class FFmpegMediaSegmenter implements MediaSegmenter {
  public readonly name = "ffmpeg";
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private readonly env: NodeJS.ProcessEnv | undefined;

  public constructor(options: FFmpegMediaSegmenterOptions = {}) {
    this.ffmpegPath = options.ffmpegPath ?? "ffmpeg";
    this.ffprobePath = options.ffprobePath ?? "ffprobe";
    this.env = options.env;
  }

  public async segment(input: SegmentMediaInput): Promise<SegmentMediaResult> {
    const resolvedInputPath = resolve(input.inputPath);
    const probe = await probeMedia({
      inputPath: resolvedInputPath,
      ffprobePath: this.ffprobePath,
      env: this.env,
    });
    const totalDurationMs = probe.durationMs;
    const chunkCount = Math.max(1, Math.ceil(totalDurationMs / input.chunkDurationMs));
    const manifestChunks: ChunkManifestEntry[] = [];

    await mkdir(input.workingDir, { recursive: true });

    for (let index = 1; index <= chunkCount; index += 1) {
      const startMs = (index - 1) * input.chunkDurationMs;
      const endMs = Math.min(totalDurationMs, index * input.chunkDurationMs);
      const outputPath = join(input.workingDir, formatChunkAudioFileName(index));

      await runCommand(
        [
          this.ffmpegPath,
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-ss",
          toSeconds(startMs),
          "-i",
          resolvedInputPath,
          "-t",
          toSeconds(endMs - startMs),
          "-vn",
          "-ac",
          String(chunkAudioFormat.channels),
          "-ar",
          String(chunkAudioFormat.sampleRateHz),
          "-sample_fmt",
          chunkAudioFormat.sampleFormat,
          outputPath,
        ],
        {
          env: this.env,
        },
      );

      manifestChunks.push({
        index,
        startMs,
        endMs,
        chunkPath: normalizeRelativePath(input.jobRootDir, outputPath),
      });
    }

    return {
      manifest: createChunkManifest({
        inputPath: resolvedInputPath,
        chunkDurationMs: input.chunkDurationMs,
        totalDurationMs,
        chunks: manifestChunks,
      }),
    };
  }
}
