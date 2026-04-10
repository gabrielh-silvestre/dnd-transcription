import { type PipelineExitCode } from "../../shared/errors.js";
import { type CleanupPolicy } from "../../shared/paths.js";
import { type ChunkManifest } from "./chunk-manifest.js";

export const jobStatuses = [
  "created",
  "segmenting",
  "ready",
  "running",
  "partial_failed",
  "succeeded",
  "fatal_error",
] as const;

export const chunkStatuses = [
  "pending",
  "running",
  "succeeded",
  "failed",
] as const;

export type JobStatus = (typeof jobStatuses)[number];
export type ChunkStatus = (typeof chunkStatuses)[number];

export interface JobCompatibilitySnapshot {
  resolvedInputPath: string;
  inputSizeBytes: number;
  inputMtimeMs: number;
  provider: string;
  chunkDurationSeconds: number;
}

export interface ChunkState {
  index: number;
  status: ChunkStatus;
  attempts: number;
  errorSummary: string | null;
  markdownPath: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface JobState {
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
  compatibility: JobCompatibilitySnapshot;
  chunks: ChunkState[];
}

const allowedJobTransitions: Record<JobStatus, readonly JobStatus[]> = {
  created: ["segmenting", "fatal_error"],
  segmenting: ["ready", "fatal_error"],
  ready: ["running", "fatal_error"],
  running: ["succeeded", "partial_failed", "fatal_error"],
  partial_failed: ["running"],
  succeeded: [],
  fatal_error: [],
};

const allowedChunkTransitions: Record<ChunkStatus, readonly ChunkStatus[]> = {
  pending: ["running"],
  running: ["succeeded", "failed", "pending"],
  succeeded: [],
  failed: ["pending"],
};

export function createInitialJobState(input: {
  jobId: string;
  provider: string;
  cleanupPolicy: CleanupPolicy;
  compatibility: JobCompatibilitySnapshot;
  createdAt?: string;
}): JobState {
  const createdAt = input.createdAt ?? new Date().toISOString();

  return {
    version: 1,
    jobId: input.jobId,
    createdAt,
    updatedAt: createdAt,
    provider: input.provider,
    cleanupPolicy: input.cleanupPolicy,
    status: "created",
    errorSummary: null,
    manifestPath: null,
    finalMarkdownPath: null,
    compatibility: input.compatibility,
    chunks: [],
  };
}

export function createPendingChunks(manifest: ChunkManifest): ChunkState[] {
  return manifest.chunks.map((chunk) => ({
    index: chunk.index,
    status: "pending",
    attempts: 0,
    errorSummary: null,
    markdownPath: null,
    startedAt: null,
    finishedAt: null,
  }));
}

export function assertJobStatusTransition(current: JobStatus, next: JobStatus): void {
  if (current === next) {
    return;
  }

  if (!allowedJobTransitions[current].includes(next)) {
    throw new Error(`Transicao de job invalida: ${current} -> ${next}`);
  }
}

export function assertChunkStatusTransition(current: ChunkStatus, next: ChunkStatus): void {
  if (current === next) {
    return;
  }

  if (!allowedChunkTransitions[current].includes(next)) {
    throw new Error(`Transicao de chunk invalida: ${current} -> ${next}`);
  }
}

export function transitionJobStatus(state: JobState, next: JobStatus): void {
  assertJobStatusTransition(state.status, next);
  state.status = next;
}

export function transitionChunkStatus(chunk: ChunkState, next: ChunkStatus): void {
  assertChunkStatusTransition(chunk.status, next);
  chunk.status = next;
}

export function computeExitCode(state: JobState): PipelineExitCode {
  if (state.status === "succeeded") {
    return 0;
  }

  if (state.status === "partial_failed") {
    return 2;
  }

  return 1;
}

export function getChunkState(state: JobState, chunkIndex: number): ChunkState {
  const chunk = state.chunks.find((candidate) => candidate.index === chunkIndex);

  if (chunk === undefined) {
    throw new Error(`Chunk ${chunkIndex} nao encontrado no estado persistido.`);
  }

  return chunk;
}

export function allChunksSucceeded(state: JobState): boolean {
  return state.chunks.every((chunk) => chunk.status === "succeeded");
}

export function getFailedChunks(state: JobState): ChunkState[] {
  return state.chunks.filter((chunk) => chunk.status === "failed");
}

export function assertCompatibleSnapshot(expected: JobCompatibilitySnapshot, actual: JobCompatibilitySnapshot): void {
  const mismatches: string[] = [];

  if (expected.resolvedInputPath !== actual.resolvedInputPath) {
    mismatches.push("resolvedInputPath");
  }

  if (expected.inputSizeBytes !== actual.inputSizeBytes) {
    mismatches.push("inputSizeBytes");
  }

  if (Math.trunc(expected.inputMtimeMs) !== Math.trunc(actual.inputMtimeMs)) {
    mismatches.push("inputMtimeMs");
  }

  if (expected.provider !== actual.provider) {
    mismatches.push("provider");
  }

  if (expected.chunkDurationSeconds !== actual.chunkDurationSeconds) {
    mismatches.push("chunkDurationSeconds");
  }

  if (mismatches.length > 0) {
    throw new Error(`Snapshot de resume incompativel: ${mismatches.join(", ")}`);
  }
}
