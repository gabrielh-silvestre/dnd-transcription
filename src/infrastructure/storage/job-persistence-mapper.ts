import { type ChunkManifest, createChunkManifest } from "../../domain/entities/chunk-manifest.js";
import {
  createInitialJobState,
  type ChunkState,
  type JobCompatibilitySnapshot,
  type JobState,
} from "../../domain/entities/job-state.js";
import { normalizeRelativePath, resolveFromRoot } from "../../shared/paths.js";
import { type ChunkManifestRecord, type ChunkManifestRecordEntry } from "./chunk-manifest-record.js";
import {
  type JobChunkStateRecord,
  type JobCompatibilitySnapshotRecord,
  type JobStateRecord,
} from "./job-state-record.js";

function normalizeIsoTimestamp(timestamp: string): string {
  return new Date(timestamp).toISOString();
}

function normalizeNullableIsoTimestamp(timestamp: string | null): string | null {
  return timestamp === null ? null : normalizeIsoTimestamp(timestamp);
}

function sortByIndex<T extends { index: number }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.index - right.index);
}

function normalizePersistedRelativePath(rootDir: string, relativePath: string): string {
  return normalizeRelativePath(rootDir, resolveFromRoot(rootDir, relativePath.replaceAll("\\", "/")));
}

function normalizeNullablePersistedRelativePath(rootDir: string, relativePath: string | null): string | null {
  return relativePath === null ? null : normalizePersistedRelativePath(rootDir, relativePath);
}

function toChunkManifestRecordEntry(rootDir: string, entry: ChunkManifest["chunks"][number]): ChunkManifestRecordEntry {
  return {
    index: entry.index,
    startMs: entry.startMs,
    endMs: entry.endMs,
    chunkPath: normalizePersistedRelativePath(rootDir, entry.chunkPath),
  };
}

function fromChunkManifestRecordEntry(rootDir: string, record: ChunkManifestRecordEntry): ChunkManifest["chunks"][number] {
  return {
    index: record.index,
    startMs: record.startMs,
    endMs: record.endMs,
    chunkPath: normalizePersistedRelativePath(rootDir, record.chunkPath),
  };
}

function toJobCompatibilitySnapshotRecord(snapshot: JobCompatibilitySnapshot): JobCompatibilitySnapshotRecord {
  return {
    resolvedInputPath: snapshot.resolvedInputPath,
    inputSizeBytes: snapshot.inputSizeBytes,
    inputMtimeMs: snapshot.inputMtimeMs,
    provider: snapshot.provider,
    transcriberSignature: snapshot.transcriberSignature,
    chunkDurationSeconds: snapshot.chunkDurationSeconds,
  };
}

function fromJobCompatibilitySnapshotRecord(record: JobCompatibilitySnapshotRecord): JobCompatibilitySnapshot {
  return {
    resolvedInputPath: record.resolvedInputPath,
    inputSizeBytes: record.inputSizeBytes,
    inputMtimeMs: record.inputMtimeMs,
    provider: record.provider,
    transcriberSignature: record.transcriberSignature,
    chunkDurationSeconds: record.chunkDurationSeconds,
  };
}

function toJobChunkStateRecord(rootDir: string, chunk: ChunkState): JobChunkStateRecord {
  return {
    index: chunk.index,
    status: chunk.status,
    attempts: chunk.attempts,
    errorSummary: chunk.errorSummary,
    markdownPath: normalizeNullablePersistedRelativePath(rootDir, chunk.markdownPath),
    startedAt: normalizeNullableIsoTimestamp(chunk.startedAt),
    finishedAt: normalizeNullableIsoTimestamp(chunk.finishedAt),
  };
}

function fromJobChunkStateRecord(rootDir: string, record: JobChunkStateRecord): ChunkState {
  return {
    index: record.index,
    status: record.status,
    attempts: record.attempts,
    errorSummary: record.errorSummary,
    markdownPath: normalizeNullablePersistedRelativePath(rootDir, record.markdownPath),
    startedAt: normalizeNullableIsoTimestamp(record.startedAt),
    finishedAt: normalizeNullableIsoTimestamp(record.finishedAt),
  };
}

export function toChunkManifestRecord(rootDir: string, manifest: ChunkManifest): ChunkManifestRecord {
  return {
    version: manifest.version,
    createdAt: normalizeIsoTimestamp(manifest.createdAt),
    inputPath: manifest.inputPath,
    chunkDurationMs: manifest.chunkDurationMs,
    totalDurationMs: manifest.totalDurationMs,
    chunks: sortByIndex(manifest.chunks).map((chunk) => toChunkManifestRecordEntry(rootDir, chunk)),
  };
}

export function fromChunkManifestRecord(rootDir: string, record: ChunkManifestRecord): ChunkManifest {
  return createChunkManifest({
    inputPath: record.inputPath,
    chunkDurationMs: record.chunkDurationMs,
    totalDurationMs: record.totalDurationMs,
    createdAt: normalizeIsoTimestamp(record.createdAt),
    chunks: sortByIndex(record.chunks).map((chunk) => fromChunkManifestRecordEntry(rootDir, chunk)),
  });
}

export function toJobStateRecord(rootDir: string, state: JobState): JobStateRecord {
  return {
    version: state.version,
    jobId: state.jobId,
    createdAt: normalizeIsoTimestamp(state.createdAt),
    updatedAt: normalizeIsoTimestamp(state.updatedAt),
    provider: state.provider,
    cleanupPolicy: state.cleanupPolicy,
    status: state.status,
    errorSummary: state.errorSummary,
    manifestPath: normalizeNullablePersistedRelativePath(rootDir, state.manifestPath),
    finalMarkdownPath: normalizeNullablePersistedRelativePath(rootDir, state.finalMarkdownPath),
    compatibility: toJobCompatibilitySnapshotRecord(state.compatibility),
    chunks: sortByIndex(state.chunks).map((chunk) => toJobChunkStateRecord(rootDir, chunk)),
  };
}

export function fromJobStateRecord(rootDir: string, record: JobStateRecord): JobState {
  const state = createInitialJobState({
    jobId: record.jobId,
    provider: record.provider,
    cleanupPolicy: record.cleanupPolicy,
    compatibility: fromJobCompatibilitySnapshotRecord(record.compatibility),
    createdAt: normalizeIsoTimestamp(record.createdAt),
  });

  state.updatedAt = normalizeIsoTimestamp(record.updatedAt);
  state.status = record.status;
  state.errorSummary = record.errorSummary;
  state.manifestPath = normalizeNullablePersistedRelativePath(rootDir, record.manifestPath);
  state.finalMarkdownPath = normalizeNullablePersistedRelativePath(rootDir, record.finalMarkdownPath);
  state.chunks = sortByIndex(record.chunks).map((chunk) => fromJobChunkStateRecord(rootDir, chunk));

  return state;
}
