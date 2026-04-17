import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";

import {
  assertChunkStatusTransition,
  createInitialJobState,
  createPendingChunks,
  getChunkState,
  transitionChunkStatus,
  transitionJobStatus,
  type JobCompatibilitySnapshot,
  type JobState,
  type JobStatus,
} from "../../domain/entities/job-state.js";
import { type ChunkManifest } from "../../domain/entities/chunk-manifest.js";
import { type JobStore } from "../../domain/ports/job-store.js";
import {
  FINAL_TRANSCRIPT_FILE_NAME,
  MANIFEST_FILE_NAME,
  formatChunkMarkdownFileName,
  normalizeRelativePath,
  resolveFromRoot,
  type CleanupPolicy,
  type JobPaths,
} from "../../shared/paths.js";
import { type ChunkManifestRecord } from "./chunk-manifest-record.js";
import { fromChunkManifestRecord, fromJobStateRecord, toChunkManifestRecord, toJobStateRecord } from "./job-persistence-mapper.js";
import { type JobStateRecord } from "./job-state-record.js";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(path: string): Promise<T> {
  const content = await readFile(path, "utf8");
  return JSON.parse(content) as T;
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function cloneState(state: JobState): JobState {
  return structuredClone(state) as JobState;
}

export class FileJobStore implements JobStore {
  public readonly paths: JobPaths;
  private mutationQueue: Promise<void> = Promise.resolve();

  public constructor(paths: JobPaths) {
    this.paths = paths;
  }

  public async hasPersistedJobArtifacts(): Promise<boolean> {
    const [manifestExists, jobStateExists] = await Promise.all([
      exists(this.paths.manifestPath),
      exists(this.paths.jobStatePath),
    ]);

    return manifestExists || jobStateExists;
  }

  public async initializeJob(input: {
    jobId: string;
    provider: string;
    cleanupPolicy: CleanupPolicy;
    compatibility: JobCompatibilitySnapshot;
  }): Promise<JobState> {
    await mkdir(this.paths.rootDir, { recursive: true });
    await mkdir(this.paths.chunksDir, { recursive: true });
    await mkdir(this.paths.transcriptsDir, { recursive: true });

    const state = createInitialJobState({
      jobId: input.jobId,
      provider: input.provider,
      cleanupPolicy: input.cleanupPolicy,
      compatibility: input.compatibility,
    });

    await this.writeJobStateRecord(toJobStateRecord(this.paths.rootDir, state));
    return state;
  }

  public async writeManifest(manifest: ChunkManifest): Promise<void> {
    await this.writeManifestRecord(toChunkManifestRecord(this.paths.rootDir, manifest));
  }

  public async readManifest(): Promise<ChunkManifest> {
    const manifestRecord = await this.readManifestRecord();
    return fromChunkManifestRecord(this.paths.rootDir, manifestRecord);
  }

  public async hydrateChunksFromManifest(manifest: ChunkManifest): Promise<JobState> {
    return await this.mutateState((state) => {
      state.manifestPath = MANIFEST_FILE_NAME;
      state.finalMarkdownPath = null;
      state.chunks = createPendingChunks(manifest);
      state.errorSummary = null;
      return state;
    });
  }

  public async readJobState(): Promise<JobState> {
    await this.waitForMutations();
    const stateRecord = await this.readJobStateRecord();
    return fromJobStateRecord(this.paths.rootDir, stateRecord);
  }

  public async tryReadJobState(): Promise<JobState | null> {
    if (!(await exists(this.paths.jobStatePath))) {
      return null;
    }

    return await this.readJobState();
  }

  public async updateJobStatus(nextStatus: JobStatus, metadata?: {
    errorSummary?: string | null;
    finalMarkdownPath?: string | null;
  }): Promise<JobState> {
    return await this.mutateState((state) => {
      transitionJobStatus(state, nextStatus);

      if (metadata?.errorSummary !== undefined) {
        state.errorSummary = metadata.errorSummary;
      } else if (nextStatus !== "partial_failed" && nextStatus !== "fatal_error") {
        state.errorSummary = null;
      }

      if (metadata?.finalMarkdownPath !== undefined) {
        state.finalMarkdownPath = metadata.finalMarkdownPath;
      }

      return state;
    });
  }

  public async reconcileForResume(): Promise<JobState> {
    return await this.mutateState((state) => {
      for (const chunk of state.chunks) {
        if (chunk.status === "failed") {
          transitionChunkStatus(chunk, "pending");
          chunk.startedAt = null;
          chunk.finishedAt = null;
        } else if (chunk.status === "running" && chunk.finishedAt === null) {
          assertChunkStatusTransition("running", "pending");
          chunk.status = "pending";
          chunk.startedAt = null;
          chunk.finishedAt = null;
        }
      }

      return state;
    });
  }

  public async markChunkRunning(chunkIndex: number): Promise<JobState> {
    return await this.mutateState((state) => {
      const chunk = getChunkState(state, chunkIndex);
      transitionChunkStatus(chunk, "running");
      chunk.attempts += 1;
      chunk.startedAt = new Date().toISOString();
      chunk.finishedAt = null;
      chunk.errorSummary = null;
      return state;
    });
  }

  public async markChunkSucceeded(chunkIndex: number, markdownPath: string): Promise<JobState> {
    return await this.mutateState((state) => {
      const chunk = getChunkState(state, chunkIndex);
      transitionChunkStatus(chunk, "succeeded");
      chunk.finishedAt = new Date().toISOString();
      chunk.markdownPath = markdownPath;
      chunk.errorSummary = null;
      return state;
    });
  }

  public async markChunkFailed(chunkIndex: number, errorSummary: string): Promise<JobState> {
    return await this.mutateState((state) => {
      const chunk = getChunkState(state, chunkIndex);
      transitionChunkStatus(chunk, "failed");
      chunk.finishedAt = new Date().toISOString();
      chunk.errorSummary = errorSummary;
      return state;
    });
  }

  public async writeChunkMarkdown(chunkIndex: number, markdown: string): Promise<string> {
    const outputPath = resolveFromRoot(this.paths.rootDir, `transcripts/${formatChunkMarkdownFileName(chunkIndex)}`);
    await writeFile(outputPath, markdown, "utf8");
    return normalizeRelativePath(this.paths.rootDir, outputPath);
  }

  public async writeFinalMarkdown(markdown: string): Promise<string> {
    await writeFile(this.paths.finalTranscriptPath, markdown, "utf8");
    return FINAL_TRANSCRIPT_FILE_NAME;
  }

  public async readMarkdown(relativePath: string): Promise<string> {
    return await readFile(resolveFromRoot(this.paths.rootDir, relativePath), "utf8");
  }

  public async cleanupChunkArtifacts(manifest: ChunkManifest): Promise<void> {
    await Promise.all(
      manifest.chunks.map(async (chunk) => {
        await rm(resolveFromRoot(this.paths.rootDir, chunk.chunkPath), { force: true });
      }),
    );
  }

  private async waitForMutations(): Promise<void> {
    await this.mutationQueue.catch(() => undefined);
  }

  // The current incremental JobStore API still mutates domain state, but disk I/O now
  // funnels through typed records so a future load/save API can reuse the same boundary.
  private async mutateState(mutator: (state: JobState) => JobState | Promise<JobState>): Promise<JobState> {
    let nextState: JobState | undefined;

    const previousQueue = this.mutationQueue.catch(() => undefined);

    this.mutationQueue = previousQueue.then(async () => {
      const currentRecord = await this.readJobStateRecord();
      const currentState = fromJobStateRecord(this.paths.rootDir, currentRecord);
      const mutableState = cloneState(currentState);
      nextState = await mutator(mutableState);
      nextState.updatedAt = new Date().toISOString();
      await this.writeJobStateRecord(toJobStateRecord(this.paths.rootDir, nextState));
    });

    await this.mutationQueue;

    if (nextState === undefined) {
      throw new Error("Falha ao persistir job-state.json");
    }

    return nextState;
  }

  private async readManifestRecord(): Promise<ChunkManifestRecord> {
    return await readJsonFile<ChunkManifestRecord>(this.paths.manifestPath);
  }

  private async writeManifestRecord(record: ChunkManifestRecord): Promise<void> {
    await writeJsonFile(this.paths.manifestPath, record);
  }

  private async readJobStateRecord(): Promise<JobStateRecord> {
    return await readJsonFile<JobStateRecord>(this.paths.jobStatePath);
  }

  private async writeJobStateRecord(record: JobStateRecord): Promise<void> {
    await writeJsonFile(this.paths.jobStatePath, record);
  }
}
