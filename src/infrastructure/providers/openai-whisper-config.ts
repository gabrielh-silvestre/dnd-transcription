import { createTranscriberSignature } from "../../domain/ports/transcriber.js";
import { ValidationError } from "../../shared/errors.js";
import { chunkAudioFormat } from "../../shared/chunk-audio-format.js";
import {
  assertOpenAIAudioChunkFitsUploadLimit,
  normalizeOptionalValue,
  OPENAI_AUDIO_RESPONSE_FORMAT,
  OPENAI_AUDIO_UPLOAD_LIMIT_BYTES,
} from "./openai-audio-provider-shared.js";

export { OPENAI_AUDIO_UPLOAD_LIMIT_BYTES } from "./openai-audio-provider-shared.js";

export const OPENAI_WHISPER_PROVIDER = "openai-whisper" as const;
export const OPENAI_WHISPER_BACKEND = "openai" as const;
export const OPENAI_WHISPER_MODEL = "whisper-1" as const;
export const OPENAI_WHISPER_RESPONSE_FORMAT = OPENAI_AUDIO_RESPONSE_FORMAT;

export interface OpenAIWhisperConfig {
  provider: typeof OPENAI_WHISPER_PROVIDER;
  backend: typeof OPENAI_WHISPER_BACKEND;
  apiKey: string;
  model: typeof OPENAI_WHISPER_MODEL;
  requestModel: typeof OPENAI_WHISPER_MODEL;
  responseFormat: typeof OPENAI_WHISPER_RESPONSE_FORMAT;
  language: string | null;
  prompt: string | null;
  endpoint: null;
  apiVersion: null;
  deployment: null;
  transcriberSignature: string;
  uploadLimitBytes: number;
  chunkFormat: typeof chunkAudioFormat;
}

export function createOpenAIWhisperConfig(env: NodeJS.ProcessEnv = process.env): OpenAIWhisperConfig {
  const apiKey = env.OPENAI_API_KEY?.trim();

  if (apiKey === undefined || apiKey.length === 0) {
    throw new ValidationError("OPENAI_API_KEY e obrigatoria para o provider openai-whisper.", "provider");
  }

  const language = normalizeOptionalValue(env.OPENAI_WHISPER_LANGUAGE, (value) => value.toLowerCase());
  const prompt = normalizeOptionalValue(env.OPENAI_WHISPER_PROMPT);

  return {
    provider: OPENAI_WHISPER_PROVIDER,
    backend: OPENAI_WHISPER_BACKEND,
    apiKey,
    model: OPENAI_WHISPER_MODEL,
    requestModel: OPENAI_WHISPER_MODEL,
    responseFormat: OPENAI_WHISPER_RESPONSE_FORMAT,
    language,
    prompt,
    endpoint: null,
    apiVersion: null,
    deployment: null,
    transcriberSignature: createTranscriberSignature({
      provider: OPENAI_WHISPER_PROVIDER,
      model: OPENAI_WHISPER_MODEL,
      responseFormat: OPENAI_WHISPER_RESPONSE_FORMAT,
      language,
      prompt,
    }),
    uploadLimitBytes: OPENAI_AUDIO_UPLOAD_LIMIT_BYTES,
    chunkFormat: chunkAudioFormat,
  };
}

export function assertChunkFitsUploadLimit(input: {
  chunkDurationMs: number;
  uploadLimitBytes?: number;
}): void {
  assertOpenAIAudioChunkFitsUploadLimit({
    ...input,
    provider: OPENAI_WHISPER_PROVIDER,
  });
}
