import { type ChunkManifest } from "./chunk-manifest.js";
import { Job, jobStatuses, type JobCompatibilitySnapshot, type JobState, type JobStatus } from "./job.js";
import { JobChunk, chunkStatuses, type ChunkState, type ChunkStatus } from "./job-chunk.js";

export {
  Job,
  jobStatuses,
  type JobCompatibilitySnapshot,
  type JobState,
  type JobStatus,
} from "./job.js";
export {
  JobChunk,
  chunkStatuses,
  type ChunkState,
  type ChunkStatus,
} from "./job-chunk.js";

function replaceJobState(target: JobState, source: JobState): void {
  target.version = source.version;
  target.jobId = source.jobId;
  target.createdAt = source.createdAt;
  target.updatedAt = source.updatedAt;
  target.provider = source.provider;
  target.cleanupPolicy = source.cleanupPolicy;
  target.status = source.status;
  target.errorSummary = source.errorSummary;
  target.manifestPath = source.manifestPath;
  target.finalMarkdownPath = source.finalMarkdownPath;
  target.compatibility = source.compatibility;
  target.chunks = source.chunks;
}

function replaceChunkState(target: ChunkState, source: ChunkState): void {
  target.index = source.index;
  target.status = source.status;
  target.attempts = source.attempts;
  target.errorSummary = source.errorSummary;
  target.markdownPath = source.markdownPath;
  target.startedAt = source.startedAt;
  target.finishedAt = source.finishedAt;
}

export function createInitialJobState(input: {
  jobId: string;
  provider: string;
  cleanupPolicy: JobState["cleanupPolicy"];
  compatibility: JobCompatibilitySnapshot;
  createdAt?: string;
}): JobState {
  return Job.createInitial(input).toState();
}

export function createPendingChunks(manifest: ChunkManifest): ChunkState[] {
  return Job.createPendingChunks(manifest).map((chunk) => chunk.toState());
}

export function assertJobStatusTransition(current: JobStatus, next: JobStatus): void {
  Job.assertStatusTransition(current, next);
}

export function assertChunkStatusTransition(current: ChunkStatus, next: ChunkStatus): void {
  JobChunk.assertStatusTransition(current, next);
}

export function transitionJobStatus(state: JobState, next: JobStatus): void {
  const job = Job.restore(state);
  job.updateStatus(next);
  replaceJobState(state, job.toState());
}

export function transitionChunkStatus(chunk: ChunkState, next: ChunkStatus): void {
  const jobChunk = JobChunk.restore(chunk);
  jobChunk.transitionTo(next);
  replaceChunkState(chunk, jobChunk.toState());
}

export function computeExitCode(state: JobState): 0 | 1 | 2 {
  return Job.restore(state).exitCode;
}

export function getChunkState(state: JobState, chunkIndex: number): ChunkState {
  const chunk = state.chunks.find((candidate) => candidate.index === chunkIndex);

  if (chunk === undefined) {
    throw new Error(`Chunk ${chunkIndex} nao encontrado no estado persistido.`);
  }

  return chunk;
}

export function allChunksSucceeded(state: JobState): boolean {
  return Job.restore(state).allChunksSucceeded();
}

export function getFailedChunks(state: JobState): ChunkState[] {
  return Job.restore(state).getFailedChunks().map((chunk) => chunk.toState());
}

export function assertCompatibleSnapshot(expected: JobCompatibilitySnapshot, actual: JobCompatibilitySnapshot): void {
  Job.assertCompatibleSnapshot(expected, actual);
}
