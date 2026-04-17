export interface ChunkManifestRecordEntry {
  index: number;
  startMs: number;
  endMs: number;
  chunkPath: string;
}

export interface ChunkManifestRecord {
  version: 1;
  createdAt: string;
  inputPath: string;
  chunkDurationMs: number;
  totalDurationMs: number;
  chunks: ChunkManifestRecordEntry[];
}
