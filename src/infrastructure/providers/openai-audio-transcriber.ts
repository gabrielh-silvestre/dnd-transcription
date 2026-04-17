import { setTimeout as delay } from "node:timers/promises";

import { type TranscriptionRequest, type TranscriptionResult } from "../../domain/entities/transcription-result.js";
import { type Transcriber } from "../../domain/ports/transcriber.js";
import {
  OpenAIAudioClientError,
  type OpenAIAudioClient,
} from "./openai-audio-client.js";

export interface OpenAIAudioTranscriberConfig {
  provider: string;
  language: string | null;
  prompt: string | null;
  transcriberSignature: string;
}

export interface OpenAIAudioTranscriberOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  delayFn?: (delayMs: number) => Promise<void>;
}

export class OpenAIAudioTranscriber implements Transcriber {
  public readonly name: string;
  public readonly signature: string;
  private readonly client: OpenAIAudioClient;
  private readonly config: OpenAIAudioTranscriberConfig;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly delayFn: (delayMs: number) => Promise<void>;

  public constructor(
    config: OpenAIAudioTranscriberConfig,
    client: OpenAIAudioClient,
    options: OpenAIAudioTranscriberOptions = {},
  ) {
    this.name = config.provider;
    this.signature = config.transcriberSignature;
    this.config = config;
    this.client = client;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 250;
    this.delayFn = options.delayFn ?? delay;
  }

  public async transcribe(input: TranscriptionRequest): Promise<TranscriptionResult> {
    let attempt = 0;

    while (true) {
      try {
        const response = await this.client.transcribe({
          audioPath: input.audioPath,
          ...(this.config.language !== null ? { language: this.config.language } : {}),
          ...(this.config.prompt !== null ? { prompt: this.config.prompt } : {}),
        });

        return {
          chunkIndex: input.chunkIndex,
          markdown: response.text,
        };
      } catch (error) {
        attempt += 1;
        const retryable = error instanceof OpenAIAudioClientError && error.retryable;

        if (!retryable || attempt > this.maxRetries) {
          throw error;
        }

        if (this.retryDelayMs > 0) {
          await this.delayFn(this.retryDelayMs);
        }
      }
    }
  }
}
