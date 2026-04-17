import { type ChunkStatus } from "../../domain/entities/job-chunk.js";
import { type JobStatus } from "../../domain/entities/job.js";
import { type CleanupPolicy } from "../../shared/paths.js";

export interface JobCompatibilitySnapshotRecord {
  resolvedInputPath: string;
  inputSizeBytes: number;
  inputMtimeMs: number;
  provider: string;
  transcriberSignature: string;
  chunkDurationSeconds: number;
}

export interface JobChunkStateRecord {
  index: number;
  status: ChunkStatus;
  attempts: number;
  errorSummary: string | null;
  markdownPath: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface JobStateRecord {
  version: 1;
  jobId: string;
  createdAt: string;
  updatedAt: string;
  provider: string;
  cleanupPolicy: CleanupPolicy;
  status: JobStatus;
  errorSummary: string | null;
  manifestPath: string | null;
  finalMarkdownPath: string | null;
  compatibility: JobCompatibilitySnapshotRecord;
  chunks: JobChunkStateRecord[];
}
