import { type TranscriptionRequest } from "../core/transcription-core.js";
import { type TranscribeToolInput } from "./tool-schemas.js";

/**
 * Maps validated `transcribe` tool params (R2 surface) onto the core-facing
 * {@link TranscriptionRequest} plus the derived `chunkDurationMs`. `provider` is
 * intentionally NOT here — it is env-derived at startup (R3) and supplied
 * separately on the core input.
 *
 * HARD RULE (R4): this gateway must NOT import the CLI's `cli-argument-parser`
 * (which owns the equivalent `toChunkDurationMs`); the `seconds * 1000`
 * conversion is inlined here so no CLI module enters the MCP graph.
 */
export interface MappedTranscribeRequest {
  request: TranscriptionRequest;
  chunkDurationMs: number;
}

export function mapParamsToRequest(params: TranscribeToolInput): MappedTranscribeRequest {
  const request: TranscriptionRequest = {
    inputs: params.inputs,
    output: params.outputDir,
    chunkDurationSeconds: params.chunkDurationSeconds,
    concurrency: params.concurrency,
    fileConcurrency: params.fileConcurrency,
    cleanupPolicy: params.cleanupPolicy,
    resume: params.resume,
  };

  return {
    request,
    chunkDurationMs: params.chunkDurationSeconds * 1_000,
  };
}
