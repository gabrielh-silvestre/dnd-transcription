import {
  RunBatchTranscriptionUseCase,
  type BatchFileResult,
  type BatchIndexWriter,
  type RunBatchTranscriptionUseCaseResult,
  type RunTranscriptionJobExecutorLike,
} from "../application/run-batch-transcription-use-case.js";
import { RunTranscriptionJobUseCase } from "../application/run-transcription-job-use-case.js";
import { type JobStore } from "../domain/ports/job-store.js";
import { type MediaSegmenter } from "../domain/ports/media-segmenter.js";
import { type TranscriberBinding } from "../domain/ports/transcriber-binding.js";
import { FFmpegMediaSegmenter } from "../infrastructure/media/ffmpeg-media-segmenter.js";
import { FileBatchIndexWriter } from "../infrastructure/storage/file-batch-index-writer.js";
import { FileJobStore } from "../infrastructure/storage/file-job-store.js";
import { type Logger } from "../shared/logger.js";
import { type CleanupPolicy, resolveJobPaths } from "../shared/paths.js";

/**
 * Per-call request: the tool-facing values from the plan's R2 schema. This is
 * the shape a gateway derives from its own input surface (CLI flags / MCP tool
 * params) and intentionally carries NO `provider` (provider is gateway-resolved
 * — CLI flag / MCP env — and supplied separately on {@link TranscriptionCoreInput}).
 */
export interface TranscriptionRequest {
  inputs: string[];
  output: string;
  chunkDurationSeconds: number;
  concurrency: number;
  fileConcurrency: number;
  cleanupPolicy: CleanupPolicy;
  resume: boolean;
}

/**
 * What {@link runTranscriptionCore} actually consumes: the per-call request plus
 * the gateway-resolved `provider`, derived `chunkDurationMs`, and the injected
 * deps. The input type is core-owned (NOT `CliDependencies`) so no gateway arg
 * type rides in through the deps.
 *
 * THUNK ARITY (PINNED): `createTranscriberBinding` is EXACTLY
 * `(resolvedInputPath: string) => TranscriberBinding` — structurally identical
 * to `RunBatchTranscriptionUseCaseInput.createTranscriberBinding`. Each gateway
 * closes over its own `provider`/`chunkDurationMs`/`config` when building it.
 */
export interface TranscriptionCoreInput {
  request: TranscriptionRequest;
  provider: string;
  chunkDurationMs: number;
  logger: Logger;
  createTranscriberBinding: (resolvedInputPath: string) => TranscriberBinding;
  createJobStore?: (outputDir: string, resolvedInputPath?: string) => JobStore;
  createMediaSegmenter?: (resolvedInputPath: string) => MediaSegmenter;
  runTranscriptionJobUseCase?: RunTranscriptionJobExecutorLike;
  batchIndexWriter?: BatchIndexWriter;
}

/** Alias for the existing structured batch result `{ exitCode, fileResults }`. */
export type TranscriptionCoreResult = RunBatchTranscriptionUseCaseResult;

export type { BatchFileResult };

/**
 * Framework-agnostic transcription core. Composes the batch use case and returns
 * the full structured `{ exitCode, fileResults }`. The core does NOT parse argv,
 * load env, validate the output dir, write to stdout, or log a summary; it does
 * NOT swallow errors (see ERROR-BOUNDARY SPLIT) — throws propagate to the
 * gateway, which owns its outer boundary.
 */
export async function runTranscriptionCore(
  input: TranscriptionCoreInput,
): Promise<TranscriptionCoreResult> {
  const createJobStore = (...args: [outputDir: string, resolvedInputPath?: string]) =>
    input.createJobStore?.(...args)
      ?? new FileJobStore(resolveJobPaths(args[0]));
  const createMediaSegmenter = (resolvedInputPath: string) =>
    input.createMediaSegmenter?.(resolvedInputPath)
      ?? new FFmpegMediaSegmenter();

  const batch = new RunBatchTranscriptionUseCase({
    executor: input.runTranscriptionJobUseCase ?? new RunTranscriptionJobUseCase(),
    batchIndexWriter: input.batchIndexWriter ?? new FileBatchIndexWriter(),
  });

  return await batch.execute({
    inputPaths: input.request.inputs,
    outputDir: input.request.output,
    chunkDurationSeconds: input.request.chunkDurationSeconds,
    chunkDurationMs: input.chunkDurationMs,
    concurrency: input.request.concurrency,
    fileConcurrency: input.request.fileConcurrency,
    provider: input.provider,
    cleanupPolicy: input.request.cleanupPolicy,
    resume: input.request.resume,
    createJobStore,
    createMediaSegmenter,
    createTranscriberBinding: input.createTranscriberBinding,
    logger: input.logger,
  });
}
