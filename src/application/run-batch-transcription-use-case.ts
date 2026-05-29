import { join } from "node:path";

import {
  type RunTranscriptionJobUseCaseInput,
  type RunTranscriptionJobUseCaseResult,
} from "./run-transcription-job-use-case.js";
import { type JobStore } from "../domain/ports/job-store.js";
import { type MediaSegmenter } from "../domain/ports/media-segmenter.js";
import { type TranscriberBinding } from "../domain/ports/transcriber-binding.js";
import { runTaskPool } from "../infrastructure/concurrency/task-pool.js";
import { summarizeError } from "../shared/errors.js";
import { createChildLogger, type Logger } from "../shared/logger.js";
import { deriveJobSubdir, type CleanupPolicy } from "../shared/paths.js";

export const SOFT_CONCURRENCY_WARN_THRESHOLD = 16;

export interface RunTranscriptionJobExecutorLike {
  execute(input: RunTranscriptionJobUseCaseInput): Promise<RunTranscriptionJobUseCaseResult>;
}

export interface BatchIndexEntry {
  inputPath: string;
  subdir: string;
  exitCode: 0 | 1 | 2;
  status: string;
}

export interface BatchIndexWriter {
  write(outputDir: string, entries: BatchIndexEntry[]): Promise<void>;
}

export interface BatchFileResult extends RunTranscriptionJobUseCaseResult {
  inputPath: string;
  subdir: string | null;
}

export interface RunBatchTranscriptionUseCaseInput {
  inputPaths: string[];
  outputDir: string;
  chunkDurationSeconds: number;
  chunkDurationMs: number;
  concurrency: number;
  fileConcurrency: number;
  provider: string;
  cleanupPolicy: CleanupPolicy;
  resume: boolean;
  createJobStore: (outputDir: string, resolvedInputPath?: string) => JobStore;
  createMediaSegmenter: (resolvedInputPath: string) => MediaSegmenter;
  createTranscriberBinding: (resolvedInputPath: string) => TranscriberBinding;
  logger: Logger;
}

export interface RunBatchTranscriptionUseCaseResult {
  exitCode: 0 | 1 | 2;
  fileResults: BatchFileResult[];
}

export class RunBatchTranscriptionUseCase {
  public constructor(
    private readonly deps: {
      executor: RunTranscriptionJobExecutorLike;
      batchIndexWriter: BatchIndexWriter;
    },
  ) {}

  public async execute(input: RunBatchTranscriptionUseCaseInput): Promise<RunBatchTranscriptionUseCaseResult> {
    const paths = this.dedupePaths(input.inputPaths);
    const isMulti = paths.length >= 2;

    const product = input.fileConcurrency * input.concurrency;
    if (product > SOFT_CONCURRENCY_WARN_THRESHOLD) {
      input.logger.warn(
        "batch",
        "file-concurrency x concurrency alto pode disparar erros 429 (thundering herd) no provider.",
        {
          fileConcurrency: input.fileConcurrency,
          chunkConcurrency: input.concurrency,
          product,
          threshold: SOFT_CONCURRENCY_WARN_THRESHOLD,
        },
      );
    }

    const items = paths.map((path, index) => ({ path, index }));
    const results: BatchFileResult[] = new Array(paths.length);

    await runTaskPool({
      items,
      concurrency: input.fileConcurrency,
      worker: async ({ path, index }) => {
        results[index] = await this.runOneFile(input, path, isMulti);
      },
    });

    if (isMulti) {
      const entries: BatchIndexEntry[] = results.map((result) => ({
        inputPath: result.inputPath,
        subdir: result.subdir!,
        exitCode: result.exitCode,
        status: result.jobStatus,
      }));
      await this.deps.batchIndexWriter.write(input.outputDir, entries);
    }

    const exitCode = this.aggregateExitCode(results);

    return { exitCode, fileResults: results };
  }

  private dedupePaths(inputPaths: string[]): string[] {
    const seen = new Set<string>();
    const deduped: string[] = [];

    for (const path of inputPaths) {
      if (seen.has(path)) {
        continue;
      }

      seen.add(path);
      deduped.push(path);
    }

    return deduped;
  }

  private aggregateExitCode(results: BatchFileResult[]): 0 | 1 | 2 {
    if (results.some((result) => result.exitCode === 1)) {
      return 1;
    }

    if (results.some((result) => result.exitCode === 2)) {
      return 2;
    }

    return 0;
  }

  private async runOneFile(
    input: RunBatchTranscriptionUseCaseInput,
    path: string,
    isMulti: boolean,
  ): Promise<BatchFileResult> {
    let subdir: string | null = null;

    try {
      if (isMulti) {
        subdir = deriveJobSubdir(path);
      }

      const jobDir = isMulti ? join(input.outputDir, subdir!) : input.outputDir;
      const jobStore = isMulti
        ? input.createJobStore(jobDir, path)
        : input.createJobStore(input.outputDir);
      const childLogger = isMulti ? createChildLogger(input.logger, subdir!) : input.logger;
      const mediaSegmenter = input.createMediaSegmenter(path);
      const transcriberBinding = input.createTranscriberBinding(path);

      let effectiveResume = input.resume;
      if (input.resume) {
        const hasArtifacts = await jobStore.hasPersistedJobArtifacts();
        if (!hasArtifacts) {
          effectiveResume = false;
        }
      }

      const result = await this.deps.executor.execute({
        inputPath: path,
        outputDir: jobDir,
        chunkDurationSeconds: input.chunkDurationSeconds,
        chunkDurationMs: input.chunkDurationMs,
        concurrency: input.concurrency,
        provider: input.provider,
        cleanupPolicy: input.cleanupPolicy,
        resume: effectiveResume,
        jobStore,
        mediaSegmenter,
        transcriberBinding,
        logger: childLogger,
      });

      return { ...result, inputPath: path, subdir };
    } catch (error) {
      return {
        inputPath: path,
        subdir,
        exitCode: 1,
        jobStatus: "fatal_error",
        failedChunks: [],
        finalMarkdownPath: null,
        errorSummary: summarizeError(error),
      };
    }
  }
}
