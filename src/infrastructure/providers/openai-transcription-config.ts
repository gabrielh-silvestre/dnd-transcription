import { createTranscriberSignature } from "../../domain/ports/transcriber.js";
import { chunkAudioFormat } from "../../shared/chunk-audio-format.js";
import { ValidationError } from "../../shared/errors.js";
import {
  assertOpenAIAudioChunkFitsUploadLimit,
  normalizeOptionalValue,
  OPENAI_AUDIO_RESPONSE_FORMAT,
  OPENAI_AUDIO_UPLOAD_LIMIT_BYTES,
} from "./openai-audio-provider-shared.js";

export const OPENAI_TRANSCRIPTION_PROVIDER = "openai-transcription" as const;
export const OPENAI_TRANSCRIPTION_RESPONSE_FORMAT = OPENAI_AUDIO_RESPONSE_FORMAT;
export const OPENAI_TRANSCRIPTION_SUPPORTED_BACKENDS = ["openai", "azure"] as const;
export const OPENAI_TRANSCRIPTION_SUPPORTED_MODELS = [
  "whisper-1",
  "gpt-4o-transcribe",
  "gpt-4o-mini-transcribe",
] as const;

export type OpenAITranscriptionBackend = typeof OPENAI_TRANSCRIPTION_SUPPORTED_BACKENDS[number];
export type OpenAITranscriptionModel = typeof OPENAI_TRANSCRIPTION_SUPPORTED_MODELS[number];

interface OpenAITranscriptionBaseConfig {
  provider: typeof OPENAI_TRANSCRIPTION_PROVIDER;
  backend: OpenAITranscriptionBackend;
  apiKey: string;
  model: OpenAITranscriptionModel;
  requestModel: string;
  responseFormat: typeof OPENAI_TRANSCRIPTION_RESPONSE_FORMAT;
  language: string | null;
  prompt: string | null;
  endpoint: string | null;
  apiVersion: string | null;
  deployment: string | null;
  transcriberSignature: string;
  uploadLimitBytes: number;
  chunkFormat: typeof chunkAudioFormat;
}

export interface OpenAITranscriptionOpenAIConfig extends OpenAITranscriptionBaseConfig {
  backend: "openai";
  endpoint: null;
  apiVersion: null;
  deployment: null;
}

export interface OpenAITranscriptionAzureConfig extends OpenAITranscriptionBaseConfig {
  backend: "azure";
  endpoint: string;
  apiVersion: string;
}

export type OpenAITranscriptionConfig = OpenAITranscriptionOpenAIConfig | OpenAITranscriptionAzureConfig;

function requireTrimmedValue(rawValue: string | undefined, message: string): string {
  const normalized = rawValue?.trim();

  if (normalized === undefined || normalized.length === 0) {
    throw new ValidationError(message, "provider");
  }

  return normalized;
}

function normalizeBackend(rawValue: string | undefined): OpenAITranscriptionBackend {
  const normalized = normalizeOptionalValue(rawValue, (value) => value.toLowerCase()) ?? "openai";

  if ((OPENAI_TRANSCRIPTION_SUPPORTED_BACKENDS as readonly string[]).includes(normalized)) {
    return normalized as OpenAITranscriptionBackend;
  }

  throw new ValidationError(
    `OPENAI_TRANSCRIPTION_BACKEND deve ser um de: ${OPENAI_TRANSCRIPTION_SUPPORTED_BACKENDS.join(", ")}.`,
    "provider",
  );
}

function normalizeModel(rawValue: string | undefined): OpenAITranscriptionModel {
  const normalized = requireTrimmedValue(
    rawValue,
    "OPENAI_TRANSCRIPTION_MODEL e obrigatoria para o provider openai-transcription.",
  );

  if ((OPENAI_TRANSCRIPTION_SUPPORTED_MODELS as readonly string[]).includes(normalized)) {
    return normalized as OpenAITranscriptionModel;
  }

  throw new ValidationError(
    `OPENAI_TRANSCRIPTION_MODEL deve ser um de: ${OPENAI_TRANSCRIPTION_SUPPORTED_MODELS.join(", ")}.`,
    "provider",
  );
}

function normalizeEndpoint(rawValue: string | undefined): string {
  return requireTrimmedValue(
    rawValue,
    "AZURE_OPENAI_ENDPOINT e obrigatoria quando OPENAI_TRANSCRIPTION_BACKEND=azure.",
  ).replace(/\/+$/u, "");
}

function createOpenAITranscriptionSignature(input: {
  backend: OpenAITranscriptionBackend;
  model: OpenAITranscriptionModel;
  responseFormat: typeof OPENAI_TRANSCRIPTION_RESPONSE_FORMAT;
  language: string | null;
  prompt: string | null;
  endpoint: string | null;
  apiVersion: string | null;
  deployment: string | null;
}): string {
  return createTranscriberSignature({
    provider: OPENAI_TRANSCRIPTION_PROVIDER,
    backend: input.backend,
    model: input.model,
    responseFormat: input.responseFormat,
    language: input.language,
    prompt: input.prompt,
    endpoint: input.endpoint,
    apiVersion: input.apiVersion,
    deployment: input.deployment,
  });
}

export function createOpenAITranscriptionConfig(
  env: NodeJS.ProcessEnv = process.env,
): OpenAITranscriptionConfig {
  const backend = normalizeBackend(env.OPENAI_TRANSCRIPTION_BACKEND);
  const model = normalizeModel(env.OPENAI_TRANSCRIPTION_MODEL);
  const language = normalizeOptionalValue(env.OPENAI_TRANSCRIPTION_LANGUAGE, (value) => value.toLowerCase());
  const prompt = normalizeOptionalValue(env.OPENAI_TRANSCRIPTION_PROMPT);

  if (backend === "openai") {
    const apiKey = requireTrimmedValue(
      env.OPENAI_API_KEY,
      "OPENAI_API_KEY e obrigatoria quando OPENAI_TRANSCRIPTION_BACKEND=openai.",
    );

    return {
      provider: OPENAI_TRANSCRIPTION_PROVIDER,
      backend,
      apiKey,
      model,
      requestModel: model,
      responseFormat: OPENAI_TRANSCRIPTION_RESPONSE_FORMAT,
      language,
      prompt,
      endpoint: null,
      apiVersion: null,
      deployment: null,
      transcriberSignature: createOpenAITranscriptionSignature({
        backend,
        model,
        responseFormat: OPENAI_TRANSCRIPTION_RESPONSE_FORMAT,
        language,
        prompt,
        endpoint: null,
        apiVersion: null,
        deployment: null,
      }),
      uploadLimitBytes: OPENAI_AUDIO_UPLOAD_LIMIT_BYTES,
      chunkFormat: chunkAudioFormat,
    };
  }

  const apiKey = requireTrimmedValue(
    env.AZURE_OPENAI_API_KEY,
    "AZURE_OPENAI_API_KEY e obrigatoria quando OPENAI_TRANSCRIPTION_BACKEND=azure.",
  );
  const endpoint = normalizeEndpoint(env.AZURE_OPENAI_ENDPOINT);
  const apiVersion = requireTrimmedValue(
    env.OPENAI_API_VERSION,
    "OPENAI_API_VERSION e obrigatoria quando OPENAI_TRANSCRIPTION_BACKEND=azure.",
  );
  const deployment = normalizeOptionalValue(env.AZURE_OPENAI_DEPLOYMENT);

  return {
    provider: OPENAI_TRANSCRIPTION_PROVIDER,
    backend,
    apiKey,
    model,
    requestModel: deployment ?? model,
    responseFormat: OPENAI_TRANSCRIPTION_RESPONSE_FORMAT,
    language,
    prompt,
    endpoint,
    apiVersion,
    deployment,
    transcriberSignature: createOpenAITranscriptionSignature({
      backend,
      model,
      responseFormat: OPENAI_TRANSCRIPTION_RESPONSE_FORMAT,
      language,
      prompt,
      endpoint,
      apiVersion,
      deployment,
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
    provider: OPENAI_TRANSCRIPTION_PROVIDER,
  });
}
