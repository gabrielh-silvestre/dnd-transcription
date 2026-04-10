import { type ChunkManifest } from "../entities/chunk-manifest.js";

export interface SegmentMediaInput {
  inputPath: string;
  jobRootDir: string;
  workingDir: string;
  chunkDurationMs: number;
}

export interface SegmentMediaResult {
  manifest: ChunkManifest;
}

export interface MediaSegmenter {
  readonly name: string;
  segment(input: SegmentMediaInput): Promise<SegmentMediaResult>;
}
