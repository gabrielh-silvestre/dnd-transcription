import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createChunkManifest, type ChunkManifestEntry } from "../../src/domain/entities/chunk-manifest.js";
import { type MediaSegmenter, type SegmentMediaInput, type SegmentMediaResult } from "../../src/domain/ports/media-segmenter.js";
import { formatChunkAudioFileName, normalizeRelativePath } from "../../src/shared/paths.js";

export interface StubMediaSegmenterOptions {
  totalDurationMs: number;
  chunks: Array<Pick<ChunkManifestEntry, "index" | "startMs" | "endMs">>;
}

export class StubMediaSegmenter implements MediaSegmenter {
  public readonly name = "stub-segmenter";
  private readonly options: StubMediaSegmenterOptions;

  public constructor(options: StubMediaSegmenterOptions) {
    this.options = options;
  }

  public async segment(input: SegmentMediaInput): Promise<SegmentMediaResult> {
    await mkdir(input.workingDir, { recursive: true });

    const manifestChunks: ChunkManifestEntry[] = [];

    for (const chunk of this.options.chunks) {
      const outputPath = join(input.workingDir, formatChunkAudioFileName(chunk.index));
      await writeFile(outputPath, `audio-${chunk.index}`, "utf8");
      manifestChunks.push({
        index: chunk.index,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
        chunkPath: normalizeRelativePath(input.jobRootDir, outputPath),
      });
    }

    return {
      manifest: createChunkManifest({
        inputPath: input.inputPath,
        chunkDurationMs: input.chunkDurationMs,
        totalDurationMs: this.options.totalDurationMs,
        chunks: manifestChunks,
      }),
    };
  }
}
