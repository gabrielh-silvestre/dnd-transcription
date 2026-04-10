import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { mergeTranscripts } from "./merge-transcripts.js";
import {
  allChunksSucceeded,
  assertCompatibleSnapshot,
  computeExitCode,
  getFailedChunks,
  type JobCompatibilitySnapshot,
  type JobState,
} from "../domain/entities/job-state.js";
import { type ChunkManifestEntry } from "../domain/entities/chunk-manifest.js";
import { type JobStore } from "../domain/ports/job-store.js";
import { type MediaSegmenter } from "../domain/ports/media-segmenter.js";
import { type Transcriber } from "../domain/ports/transcriber.js";
import { runTaskPool } from "../infrastructure/concurrency/task-pool.js";
import { summarizeError } from "../shared/errors.js";
import { type Logger } from "../shared/logger.js";
import { formatChunkIndex, type CleanupPolicy } from "../shared/paths.js";

export interface RunTranscriptionJobInput {
  inputPath: string;
  outputDir: string;
  chunkDurationSeconds: number;
  chunkDurationMs: number;
  concurrency: number;
  provider: string;
  cleanupPolicy: CleanupPolicy;
  resume: boolean;
  jobStore: JobStore;
  mediaSegmenter: MediaSegmenter;
  transcriber: Transcriber;
  logger: Logger;
}

export interface RunTranscriptionJobResult {
  exitCode: 0 | 1 | 2;
  jobStatus: JobState["status"];
  failedChunks: number[];
  finalMarkdownPath: string | null;
  errorSummary: string | null;
}

function renderChunkMarkdown(chunk: ChunkManifestEntry, transcribedMarkdown: string): string {
  return [
    `# Chunk ${formatChunkIndex(chunk.index)}`,
    "",
    `- index: ${chunk.index}`,
    `- startMs: ${chunk.startMs}`,
    `- endMs: ${chunk.endMs}`,
    "",
    transcribedMarkdown.trim(),
    "",
  ].join("\n");
}

async function createCompatibilitySnapshot(input: {
  inputPath: string;
  provider: string;
  chunkDurationSeconds: number;
}): Promise<JobCompatibilitySnapshot> {
  const resolvedInputPath = resolve(input.inputPath);
  const inputStat = await stat(resolvedInputPath);

  return {
    resolvedInputPath,
    inputSizeBytes: inputStat.size,
    inputMtimeMs: inputStat.mtimeMs,
    provider: input.provider,
    chunkDurationSeconds: input.chunkDurationSeconds,
  };
}

async function finishBootstrappingNewJob(input: RunTranscriptionJobInput, compatibility: JobCompatibilitySnapshot): Promise<void> {
  input.logger.info("probe", "Inicializando novo job.", {
    inputPath: compatibility.resolvedInputPath,
    outputDir: resolve(input.outputDir),
  });
  await input.jobStore.updateJobStatus("segmenting");

  input.logger.info("split", "Segmentando audio em chunks wav.", {
    chunkDurationMs: input.chunkDurationMs,
    segmenter: input.mediaSegmenter.name,
  });
  const segmentation = await input.mediaSegmenter.segment({
    inputPath: compatibility.resolvedInputPath,
    jobRootDir: input.jobStore.paths.rootDir,
    workingDir: input.jobStore.paths.chunksDir,
    chunkDurationMs: input.chunkDurationMs,
  });

  await input.jobStore.writeManifest(segmentation.manifest);
  await input.jobStore.hydrateChunksFromManifest(segmentation.manifest);
  await input.jobStore.updateJobStatus("ready");
}

async function prepareResume(input: RunTranscriptionJobInput, compatibility: JobCompatibilitySnapshot): Promise<JobState> {
  const existingState = await input.jobStore.readJobState();
  await input.jobStore.readManifest();

  assertCompatibleSnapshot(existingState.compatibility, compatibility);

  if (existingState.status === "created" || existingState.status === "segmenting" || existingState.status === "fatal_error") {
    throw new Error(`Job em estado ${existingState.status} nao pode ser retomado.`);
  }

  if (existingState.status === "succeeded") {
    return existingState;
  }

  return await input.jobStore.reconcileForResume();
}

function collectPendingChunks(state: JobState, manifestChunks: ChunkManifestEntry[]): ChunkManifestEntry[] {
  const pendingIndexes = new Set(
    state.chunks
      .filter((chunk) => chunk.status === "pending")
      .map((chunk) => chunk.index),
  );

  return manifestChunks.filter((chunk) => pendingIndexes.has(chunk.index));
}

async function transcribeChunk(input: RunTranscriptionJobInput, chunk: ChunkManifestEntry): Promise<void> {
  input.logger.info("transcribe", "Processando chunk.", {
    chunk: formatChunkIndex(chunk.index),
  });
  await input.jobStore.markChunkRunning(chunk.index);

  try {
    const transcription = await input.transcriber.transcribe({
      chunkIndex: chunk.index,
      audioPath: resolve(input.jobStore.paths.rootDir, chunk.chunkPath),
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      jobMetadata: {
        provider: input.provider,
        sourceFile: basename(input.inputPath),
      },
    });
    const markdownPath = await input.jobStore.writeChunkMarkdown(
      chunk.index,
      renderChunkMarkdown(chunk, transcription.markdown),
    );
    await input.jobStore.markChunkSucceeded(chunk.index, markdownPath);
  } catch (error) {
    const errorSummary = summarizeError(error);
    await input.jobStore.markChunkFailed(chunk.index, errorSummary);
    input.logger.error("transcribe", `Chunk ${formatChunkIndex(chunk.index)} falhou.`, {
      errorSummary,
    });
  }
}

async function ensureRunningState(input: RunTranscriptionJobInput, state: JobState): Promise<JobState> {
  if (state.status === "ready" || state.status === "partial_failed") {
    return await input.jobStore.updateJobStatus("running");
  }

  return state;
}

function buildResultFromState(state: JobState): RunTranscriptionJobResult {
  return {
    exitCode: computeExitCode(state),
    jobStatus: state.status,
    failedChunks: getFailedChunks(state).map((chunk) => chunk.index),
    finalMarkdownPath: state.finalMarkdownPath,
    errorSummary: state.errorSummary,
  };
}

async function markFatalIfPossible(jobStore: JobStore, errorSummary: string): Promise<void> {
  const currentState = await jobStore.tryReadJobState();

  if (currentState === null) {
    return;
  }

  if (currentState.status === "succeeded" || currentState.status === "fatal_error") {
    return;
  }

  if (currentState.status === "partial_failed") {
    return;
  }

  await jobStore.updateJobStatus("fatal_error", { errorSummary });
}

export async function runTranscriptionJob(input: RunTranscriptionJobInput): Promise<RunTranscriptionJobResult> {
  let stateIsMutable = false;

  try {
    const compatibility = await createCompatibilitySnapshot({
      inputPath: input.inputPath,
      provider: input.provider,
      chunkDurationSeconds: input.chunkDurationSeconds,
    });
    const artifactsExist = await input.jobStore.hasPersistedJobArtifacts();

    if (artifactsExist) {
      if (!input.resume) {
        throw new Error("outputDir ja contem artefatos de job. Use --resume para reaproveitar o estado persistido.");
      }

      await prepareResume(input, compatibility);
      stateIsMutable = true;
    } else {
      if (input.resume) {
        throw new Error("Nao existe job persistido para retomar com --resume.");
      }

      await input.jobStore.initializeJob({
        jobId: randomUUID(),
        provider: input.provider,
        cleanupPolicy: input.cleanupPolicy,
        compatibility,
      });
      stateIsMutable = true;
      await finishBootstrappingNewJob(input, compatibility);
    }

    let currentState = await input.jobStore.readJobState();

    if (currentState.status === "succeeded") {
      return buildResultFromState(currentState);
    }

    currentState = await ensureRunningState(input, currentState);

    const manifest = await input.jobStore.readManifest();
    const pendingChunks = collectPendingChunks(currentState, manifest.chunks);

    await runTaskPool({
      items: pendingChunks,
      concurrency: input.concurrency,
      worker: async (chunk) => {
        await transcribeChunk(input, chunk);
      },
    });

    currentState = await input.jobStore.readJobState();

    if (getFailedChunks(currentState).length > 0) {
      currentState = await input.jobStore.updateJobStatus("partial_failed", {
        errorSummary: "Uma ou mais transcricoes falharam; o job pode ser retomado com --resume.",
      });

      return buildResultFromState(currentState);
    }

    if (!allChunksSucceeded(currentState)) {
      throw new Error("Estado inconsistente: ha chunks sem sucesso mesmo sem falhas registradas.");
    }

    const merged = await mergeTranscripts({
      jobStore: input.jobStore,
      logger: input.logger,
    });
    currentState = await input.jobStore.updateJobStatus("succeeded", {
      errorSummary: null,
      finalMarkdownPath: merged.finalMarkdownPath,
    });

    if (input.cleanupPolicy === "on-success") {
      try {
        await input.jobStore.cleanupChunkArtifacts(manifest);
      } catch (error) {
        input.logger.warn("merge", "Nao foi possivel limpar os chunks intermediarios.", {
          errorSummary: summarizeError(error),
        });
      }
    }

    return buildResultFromState(currentState);
  } catch (error) {
    const errorSummary = summarizeError(error);

    if (stateIsMutable) {
      await markFatalIfPossible(input.jobStore, errorSummary);
    }

    return {
      exitCode: 1,
      jobStatus: "fatal_error",
      failedChunks: [],
      finalMarkdownPath: null,
      errorSummary,
    };
  }
}
