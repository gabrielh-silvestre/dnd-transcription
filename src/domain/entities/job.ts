import { type PipelineExitCode } from "../../shared/errors.js";
import { type CleanupPolicy } from "../../shared/paths.js";
import { type ChunkManifest } from "./chunk-manifest.js";
import { JobChunk, type ChunkState } from "./job-chunk.js";

export const jobStatuses = [
  "created",
  "segmenting",
  "ready",
  "running",
  "partial_failed",
  "succeeded",
  "fatal_error",
] as const;

export type JobStatus = (typeof jobStatuses)[number];

export interface JobCompatibilitySnapshot {
  resolvedInputPath: string;
  inputSizeBytes: number;
  inputMtimeMs: number;
  provider: string;
  transcriberSignature: string;
  chunkDurationSeconds: number;
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

function cloneCompatibilitySnapshot(snapshot: JobCompatibilitySnapshot): JobCompatibilitySnapshot {
  return { ...snapshot };
}

function sortChunksByIndex(chunks: readonly JobChunk[]): JobChunk[] {
  return [...chunks].sort((left, right) => left.index - right.index);
}

export class Job {
  private readonly versionValue: 1;
  private readonly jobIdValue: string;
  private readonly createdAtValue: string;
  private updatedAtValue: string;
  private readonly providerValue: string;
  private readonly cleanupPolicyValue: CleanupPolicy;
  private readonly compatibilityValue: JobCompatibilitySnapshot;
  private statusValue: JobStatus;
  private errorSummaryValue: string | null;
  private manifestPathValue: string | null;
  private finalMarkdownPathValue: string | null;
  private chunkList: JobChunk[];

  private constructor(state: JobState) {
    this.versionValue = state.version;
    this.jobIdValue = state.jobId;
    this.createdAtValue = state.createdAt;
    this.updatedAtValue = state.updatedAt;
    this.providerValue = state.provider;
    this.cleanupPolicyValue = state.cleanupPolicy;
    this.compatibilityValue = cloneCompatibilitySnapshot(state.compatibility);
    this.statusValue = state.status;
    this.errorSummaryValue = state.errorSummary;
    this.manifestPathValue = state.manifestPath;
    this.finalMarkdownPathValue = state.finalMarkdownPath;
    this.chunkList = sortChunksByIndex(state.chunks.map((chunk) => JobChunk.restore(chunk)));
  }

  public static createInitial(input: {
    jobId: string;
    provider: string;
    cleanupPolicy: CleanupPolicy;
    compatibility: JobCompatibilitySnapshot;
    createdAt?: string;
  }): Job {
    const createdAt = input.createdAt ?? new Date().toISOString();

    return new Job({
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
      compatibility: cloneCompatibilitySnapshot(input.compatibility),
      chunks: [],
    });
  }

  public static restore(state: JobState): Job {
    if (state.version !== 1) {
      throw new Error(`Versao de job-state invalida: ${state.version}`);
    }

    return new Job({
      ...state,
      compatibility: cloneCompatibilitySnapshot(state.compatibility),
      chunks: state.chunks.map((chunk) => JobChunk.restore(chunk).toState()),
    });
  }

  public static createPendingChunks(manifest: ChunkManifest): JobChunk[] {
    return manifest.chunks.map((chunk) => JobChunk.createPending(chunk.index));
  }

  public static assertStatusTransition(current: JobStatus, next: JobStatus): void {
    if (current === next) {
      return;
    }

    if (!allowedJobTransitions[current].includes(next)) {
      throw new Error(`Transicao de job invalida: ${current} -> ${next}`);
    }
  }

  public static assertCompatibleSnapshot(expected: JobCompatibilitySnapshot, actual: JobCompatibilitySnapshot): void {
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

    if (expected.transcriberSignature !== actual.transcriberSignature) {
      mismatches.push("transcriberSignature");
    }

    if (expected.chunkDurationSeconds !== actual.chunkDurationSeconds) {
      mismatches.push("chunkDurationSeconds");
    }

    if (mismatches.length > 0) {
      throw new Error(`Snapshot de resume incompativel: ${mismatches.join(", ")}`);
    }
  }

  public get version(): 1 {
    return this.versionValue;
  }

  public get jobId(): string {
    return this.jobIdValue;
  }

  public get createdAt(): string {
    return this.createdAtValue;
  }

  public get updatedAt(): string {
    return this.updatedAtValue;
  }

  public get provider(): string {
    return this.providerValue;
  }

  public get cleanupPolicy(): CleanupPolicy {
    return this.cleanupPolicyValue;
  }

  public get status(): JobStatus {
    return this.statusValue;
  }

  public get errorSummary(): string | null {
    return this.errorSummaryValue;
  }

  public get manifestPath(): string | null {
    return this.manifestPathValue;
  }

  public get finalMarkdownPath(): string | null {
    return this.finalMarkdownPathValue;
  }

  public get compatibility(): JobCompatibilitySnapshot {
    return cloneCompatibilitySnapshot(this.compatibilityValue);
  }

  public get chunks(): readonly JobChunk[] {
    return this.chunkList;
  }

  public get exitCode(): PipelineExitCode {
    switch (this.status) {
      case "succeeded":
        return 0;
      case "partial_failed":
        return 2;
      default:
        return 1;
    }
  }

  public touch(updatedAt = new Date().toISOString()): this {
    this.updatedAtValue = updatedAt;
    return this;
  }

  public updateStatus(nextStatus: JobStatus, metadata?: {
    errorSummary?: string | null;
    finalMarkdownPath?: string | null;
  }): this {
    Job.assertStatusTransition(this.statusValue, nextStatus);
    this.statusValue = nextStatus;

    if (metadata?.errorSummary !== undefined) {
      this.errorSummaryValue = metadata.errorSummary;
    } else if (nextStatus !== "partial_failed" && nextStatus !== "fatal_error") {
      this.errorSummaryValue = null;
    }

    if (metadata?.finalMarkdownPath !== undefined) {
      this.finalMarkdownPathValue = metadata.finalMarkdownPath;
    }

    return this;
  }

  public hydrateFromManifest(manifest: ChunkManifest, manifestPath: string): this {
    this.manifestPathValue = manifestPath;
    this.finalMarkdownPathValue = null;
    this.errorSummaryValue = null;
    this.chunkList = Job.createPendingChunks(manifest);
    return this;
  }

  public getChunk(chunkIndex: number): JobChunk {
    const chunk = this.chunkList.find((candidate) => candidate.index === chunkIndex);

    if (chunk === undefined) {
      throw new Error(`Chunk ${chunkIndex} nao encontrado no estado persistido.`);
    }

    return chunk;
  }

  public getPendingChunks(): JobChunk[] {
    return this.chunkList.filter((chunk) => chunk.status === "pending");
  }

  public getFailedChunks(): JobChunk[] {
    return this.chunkList.filter((chunk) => chunk.status === "failed");
  }

  public allChunksSucceeded(): boolean {
    return this.chunkList.every((chunk) => chunk.status === "succeeded");
  }

  public assertCompatibleSnapshot(actual: JobCompatibilitySnapshot): void {
    Job.assertCompatibleSnapshot(this.compatibilityValue, actual);
  }

  public reconcileForResume(): this {
    for (const chunk of this.chunkList) {
      if (chunk.status === "failed" || (chunk.status === "running" && chunk.finishedAt === null)) {
        chunk.returnToPending();
      }
    }

    return this;
  }

  public markChunkRunning(chunkIndex: number, startedAt = new Date().toISOString()): this {
    this.getChunk(chunkIndex).markRunning(startedAt);
    return this;
  }

  public markChunkSucceeded(chunkIndex: number, markdownPath: string, finishedAt = new Date().toISOString()): this {
    this.getChunk(chunkIndex).markSucceeded(markdownPath, finishedAt);
    return this;
  }

  public markChunkFailed(chunkIndex: number, errorSummary: string, finishedAt = new Date().toISOString()): this {
    this.getChunk(chunkIndex).markFailed(errorSummary, finishedAt);
    return this;
  }

  public toState(): JobState {
    return {
      version: this.versionValue,
      jobId: this.jobIdValue,
      createdAt: this.createdAtValue,
      updatedAt: this.updatedAtValue,
      provider: this.providerValue,
      cleanupPolicy: this.cleanupPolicyValue,
      status: this.statusValue,
      errorSummary: this.errorSummaryValue,
      manifestPath: this.manifestPathValue,
      finalMarkdownPath: this.finalMarkdownPathValue,
      compatibility: cloneCompatibilitySnapshot(this.compatibilityValue),
      chunks: sortChunksByIndex(this.chunkList).map((chunk) => chunk.toState()),
    };
  }
}
