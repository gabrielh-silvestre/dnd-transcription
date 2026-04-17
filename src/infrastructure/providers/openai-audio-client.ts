import { createReadStream, type ReadStream } from "node:fs";

import OpenAI, { AzureOpenAI } from "openai";

import { summarizeError, toError } from "../../shared/errors.js";

export interface OpenAIAudioClientProviderConfig {
  backend: "openai" | "azure";
  apiKey: string;
  model: string;
  requestModel: string;
  responseFormat: string;
  endpoint: string | null;
  apiVersion: string | null;
  deployment: string | null;
}

export interface OpenAIAudioClientRequest {
  audioPath: string;
  language?: string;
  prompt?: string;
}

export interface OpenAIAudioClientResponse {
  text: string;
}

export interface OpenAIAudioCreateRequest {
  file: ReadStream;
  model: string;
  response_format: string;
  language?: string;
  prompt?: string;
}

export interface OpenAITranscriptionsApiLike {
  create(request: OpenAIAudioCreateRequest): PromiseLike<{ text: string }>;
}

export interface OpenAIAudioSdkLike {
  audio: {
    transcriptions: OpenAITranscriptionsApiLike;
  };
}

export interface OpenAIAudioClient {
  transcribe(input: OpenAIAudioClientRequest): Promise<OpenAIAudioClientResponse>;
}

const retryableErrorCodes = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
]);

function getProperty(error: unknown, key: string): unknown {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  return (error as Record<string, unknown>)[key];
}

function getStringProperty(error: unknown, key: string): string | undefined {
  const value = getProperty(error, key);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getNumberProperty(error: unknown, key: string): number | undefined {
  const value = getProperty(error, key);
  return typeof value === "number" ? value : undefined;
}

function findRetryableCode(error: unknown): string | undefined {
  const directCode = getStringProperty(error, "code");

  if (directCode !== undefined) {
    return directCode;
  }

  const cause = getProperty(error, "cause");

  if (cause !== undefined) {
    return findRetryableCode(cause);
  }

  return undefined;
}

export function classifyOpenAIAudioError(error: unknown): { retryable: boolean } {
  const status = getNumberProperty(error, "status");

  if (status !== undefined) {
    return {
      retryable: status === 408 || status === 409 || status === 429 || status >= 500,
    };
  }

  const name = getStringProperty(error, "name");

  if (name === "APIConnectionError" || name === "APIConnectionTimeoutError") {
    return { retryable: true };
  }

  const code = findRetryableCode(error);

  if (code !== undefined && retryableErrorCodes.has(code)) {
    return { retryable: true };
  }

  return { retryable: false };
}

export class OpenAIAudioClientError extends Error {
  public readonly retryable: boolean;

  public constructor(error: unknown) {
    const classification = classifyOpenAIAudioError(error);

    super(summarizeError(error), { cause: toError(error) });
    this.name = "OpenAIAudioClientError";
    this.retryable = classification.retryable;
  }
}

export function createOpenAIAudioSdk(config: OpenAIAudioClientProviderConfig): OpenAIAudioSdkLike {
  if (config.backend === "azure") {
    return new AzureOpenAI({
      apiKey: config.apiKey,
      endpoint: config.endpoint ?? undefined,
      apiVersion: config.apiVersion ?? undefined,
      ...(config.deployment !== null ? { deployment: config.deployment } : {}),
    }) as unknown as OpenAIAudioSdkLike;
  }

  return new OpenAI({ apiKey: config.apiKey }) as unknown as OpenAIAudioSdkLike;
}

export class DefaultOpenAIAudioClient implements OpenAIAudioClient {
  private readonly sdk: OpenAIAudioSdkLike;
  private readonly requestModel: string;
  private readonly responseFormat: string;

  public constructor(
    config: OpenAIAudioClientProviderConfig,
    sdk: OpenAIAudioSdkLike = createOpenAIAudioSdk(config),
  ) {
    this.sdk = sdk;
    this.requestModel = config.requestModel;
    this.responseFormat = config.responseFormat;
  }

  public async transcribe(input: OpenAIAudioClientRequest): Promise<OpenAIAudioClientResponse> {
    try {
      const response = await this.sdk.audio.transcriptions.create({
        file: createReadStream(input.audioPath),
        model: this.requestModel,
        response_format: this.responseFormat,
        ...(input.language !== undefined ? { language: input.language } : {}),
        ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
      });

      return { text: response.text };
    } catch (error) {
      throw new OpenAIAudioClientError(error);
    }
  }
}
