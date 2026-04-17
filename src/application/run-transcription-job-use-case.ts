import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { MergeTranscriptsUseCase } from "./merge-transcripts-use-case.js";
import { type ChunkManifest, type ChunkManifestEntry } from "../domain/entities/chunk-manifest.js";
import { Job } from "../domain/entities/job.js";
import {
  type JobCompatibilitySnapshot,
  type JobState,
} from "../domain/entities/job-state.js";
import { type JobStore } from "../domain/ports/job-store.js";
import { type MediaSegmenter } from "../domain/ports/media-segmenter.js";
import { type TranscriberBinding } from "../domain/ports/transcriber-binding.js";
import { type Transcriber } from "../domain/ports/transcriber.js";
import { runTaskPool } from "../infrastructure/concurrency/task-pool.js";
import { summarizeError } from "../shared/errors.js";
import { type Logger } from "../shared/logger.js";
import { formatChunkIndex, type CleanupPolicy } from "../shared/paths.js";

export interface RunTranscriptionJobUseCaseInput {
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
  transcriberBinding: TranscriberBinding;
  logger: Logger;
}

export interface RunTranscriptionJobUseCaseResult {
  exitCode: 0 | 1 | 2;
  jobStatus: JobState["status"];
  failedChunks: number[];
  finalMarkdownPath: string | null;
  errorSummary: string | null;
}

export class RunTranscriptionJobUseCase {
  private readonly mergeTranscriptsUseCase: MergeTranscriptsUseCase;

  public constructor(
    dependencies: {
      mergeTranscriptsUseCase?: MergeTranscriptsUseCase;
    } = {},
  ) {
    this.mergeTranscriptsUseCase = dependencies.mergeTranscriptsUseCase ?? new MergeTranscriptsUseCase();
  }

  public async execute(input: RunTranscriptionJobUseCaseInput): Promise<RunTranscriptionJobUseCaseResult> {
    let stateIsMutable = false;

    try {
      const compatibility = await this.createCompatibilitySnapshot({
        inputPath: input.inputPath,
        provider: input.provider,
        transcriberSignature: input.transcriberBinding.signature,
        chunkDurationSeconds: input.chunkDurationSeconds,
      });
      const artifactsExist = await input.jobStore.hasPersistedJobArtifacts();

      if (artifactsExist) {
        if (!input.resume) {
          throw new Error("outputDir ja contem artefatos de job. Use --resume para reaproveitar o estado persistido.");
        }

        await this.prepareResume(input, compatibility);
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
        await this.finishBootstrappingNewJob(input, compatibility);
      }

      let currentState = await input.jobStore.readJobState();

      if (currentState.status === "succeeded") {
        return this.buildResultFromState(currentState);
      }

      currentState = await this.ensureRunningState(input, currentState);

      const manifest = await input.jobStore.readManifest();
      const pendingChunks = this.collectPendingChunks(currentState, manifest);

      if (pendingChunks.length > 0) {
        const transcriber = await input.transcriberBinding.createTranscriber();

        await runTaskPool({
          items: pendingChunks,
          concurrency: input.concurrency,
          worker: async (chunk) => {
            await this.transcribeChunk(input, transcriber, chunk);
          },
        });
      }

      currentState = await input.jobStore.readJobState();
      const currentJob = Job.restore(currentState);

      if (currentJob.getFailedChunks().length > 0) {
        currentState = await input.jobStore.updateJobStatus("partial_failed", {
          errorSummary: "Uma ou mais transcricoes falharam; o job pode ser retomado com --resume.",
        });

        return this.buildResultFromState(currentState);
      }

      if (!currentJob.allChunksSucceeded()) {
        throw new Error("Estado inconsistente: ha chunks sem sucesso mesmo sem falhas registradas.");
      }

      const merged = await this.mergeTranscriptsUseCase.execute({
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

      return this.buildResultFromState(currentState);
    } catch (error) {
      const errorSummary = summarizeError(error);

      if (stateIsMutable) {
        await this.markFatalIfPossible(input.jobStore, errorSummary);
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

  private renderChunkMarkdown(chunk: ChunkManifestEntry, transcribedMarkdown: string): string {
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

  private async createCompatibilitySnapshot(input: {
    inputPath: string;
    provider: string;
    transcriberSignature: string;
    chunkDurationSeconds: number;
  }): Promise<JobCompatibilitySnapshot> {
    const resolvedInputPath = resolve(input.inputPath);
    const inputStat = await stat(resolvedInputPath);

    return {
      resolvedInputPath,
      inputSizeBytes: inputStat.size,
      inputMtimeMs: inputStat.mtimeMs,
      provider: input.provider,
      transcriberSignature: input.transcriberSignature,
      chunkDurationSeconds: input.chunkDurationSeconds,
    };
  }

  private async finishBootstrappingNewJob(
    input: RunTranscriptionJobUseCaseInput,
    compatibility: JobCompatibilitySnapshot,
  ): Promise<void> {
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

  private async prepareResume(
    input: RunTranscriptionJobUseCaseInput,
    compatibility: JobCompatibilitySnapshot,
  ): Promise<JobState> {
    const existingState = await input.jobStore.readJobState();
    const existingJob = Job.restore(existingState);
    await input.jobStore.readManifest();

    existingJob.assertCompatibleSnapshot(compatibility);

    if (existingJob.status === "created" || existingJob.status === "segmenting" || existingJob.status === "fatal_error") {
      throw new Error(`Job em estado ${existingJob.status} nao pode ser retomado.`);
    }

    if (existingJob.status === "succeeded") {
      return existingJob.toState();
    }

    return await input.jobStore.reconcileForResume();
  }

  private collectPendingChunks(state: JobState, manifest: ChunkManifest): ChunkManifestEntry[] {
    const pendingIndexes = new Set(
      Job.restore(state)
        .getPendingChunks()
        .map((chunk) => chunk.index),
    );

    return manifest.chunks.filter((chunk) => pendingIndexes.has(chunk.index));
  }

  private async transcribeChunk(
    input: RunTranscriptionJobUseCaseInput,
    transcriber: Transcriber,
    chunk: ChunkManifestEntry,
  ): Promise<void> {
    input.logger.info("transcribe", "Processando chunk.", {
      chunk: formatChunkIndex(chunk.index),
    });
    await input.jobStore.markChunkRunning(chunk.index);

    try {
      const transcription = await transcriber.transcribe({
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
        this.renderChunkMarkdown(chunk, transcription.markdown),
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

  private async ensureRunningState(
    input: RunTranscriptionJobUseCaseInput,
    state: JobState,
  ): Promise<JobState> {
    const job = Job.restore(state);

    if (job.status === "ready" || job.status === "partial_failed") {
      return await input.jobStore.updateJobStatus("running");
    }

    return state;
  }

  private buildResultFromState(state: JobState): RunTranscriptionJobUseCaseResult {
    const job = Job.restore(state);

    return {
      exitCode: job.exitCode,
      jobStatus: job.status,
      failedChunks: job.getFailedChunks().map((chunk) => chunk.index),
      finalMarkdownPath: job.finalMarkdownPath,
      errorSummary: job.errorSummary,
    };
  }

  private async markFatalIfPossible(jobStore: JobStore, errorSummary: string): Promise<void> {
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
}
