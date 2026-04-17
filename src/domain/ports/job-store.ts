import { type ChunkManifest } from "../entities/chunk-manifest.js";
import { type JobCompatibilitySnapshot, type JobState, type JobStatus } from "../entities/job.js";
import { type CleanupPolicy, type JobPaths } from "../../shared/paths.js";

export interface JobStore {
  readonly paths: JobPaths;
  hasPersistedJobArtifacts(): Promise<boolean>;
  initializeJob(input: {
    jobId: string;
    provider: string;
    cleanupPolicy: CleanupPolicy;
    compatibility: JobCompatibilitySnapshot;
  }): Promise<JobState>;
  writeManifest(manifest: ChunkManifest): Promise<void>;
  readManifest(): Promise<ChunkManifest>;
  hydrateChunksFromManifest(manifest: ChunkManifest): Promise<JobState>;
  readJobState(): Promise<JobState>;
  tryReadJobState(): Promise<JobState | null>;
  updateJobStatus(nextStatus: JobStatus, metadata?: {
    errorSummary?: string | null;
    finalMarkdownPath?: string | null;
  }): Promise<JobState>;
  reconcileForResume(): Promise<JobState>;
  markChunkRunning(chunkIndex: number): Promise<JobState>;
  markChunkSucceeded(chunkIndex: number, markdownPath: string): Promise<JobState>;
  markChunkFailed(chunkIndex: number, errorSummary: string): Promise<JobState>;
  writeChunkMarkdown(chunkIndex: number, markdown: string): Promise<string>;
  writeFinalMarkdown(markdown: string): Promise<string>;
  readMarkdown(relativePath: string): Promise<string>;
  cleanupChunkArtifacts(manifest: ChunkManifest): Promise<void>;
}
