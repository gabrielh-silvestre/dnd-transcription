import assert from "node:assert/strict";
import test from "node:test";

import { OpenAIAudioClientError, type OpenAIAudioClient } from "../../src/infrastructure/providers/openai-audio-client.js";
import { createOpenAIWhisperConfig } from "../../src/infrastructure/providers/openai-whisper-config.js";
import { OpenAIWhisperTranscriber } from "../../src/infrastructure/providers/openai-whisper-transcriber.js";

function createConfig(overrides: NodeJS.ProcessEnv = {}) {
  return createOpenAIWhisperConfig({
    OPENAI_API_KEY: "sk-test",
    ...overrides,
  });
}

test("OpenAIWhisperTranscriber transforma resposta normalizada em TranscriptionResult", async () => {
  const config = createConfig({
    OPENAI_WHISPER_LANGUAGE: "pt",
    OPENAI_WHISPER_PROMPT: "glossario",
  });
  const capturedInputs: Array<{ audioPath: string; language?: string; prompt?: string }> = [];
  const client: OpenAIAudioClient = {
    transcribe: async (input) => {
      capturedInputs.push(input);
      return { text: "markdown bruto" };
    },
  };
  const transcriber = new OpenAIWhisperTranscriber(config, client);

  const result = await transcriber.transcribe({
    chunkIndex: 2,
    audioPath: "/tmp/chunk-0002.wav",
    startMs: 0,
    endMs: 60_000,
  });

  assert.deepEqual(result, {
    chunkIndex: 2,
    markdown: "markdown bruto",
  });
  assert.deepEqual(capturedInputs, [
    {
      audioPath: "/tmp/chunk-0002.wav",
      language: "pt",
      prompt: "glossario",
    },
  ]);
});

test("OpenAIWhisperTranscriber aplica retries limitados para falhas retryaveis", async () => {
  const config = createConfig();
  const delays: number[] = [];
  let attempts = 0;
  const client: OpenAIAudioClient = {
    transcribe: async () => {
      attempts += 1;

      if (attempts < 3) {
        throw new OpenAIAudioClientError({
          status: 429,
          message: "temporariamente indisponivel",
        });
      }

      return { text: "ok apos retry" };
    },
  };
  const transcriber = new OpenAIWhisperTranscriber(config, client, {
    maxRetries: 2,
    retryDelayMs: 15,
    delayFn: async (delayMs) => {
      delays.push(delayMs);
    },
  });

  const result = await transcriber.transcribe({
    chunkIndex: 1,
    audioPath: "/tmp/chunk-0001.wav",
    startMs: 0,
    endMs: 60_000,
  });

  assert.equal(result.markdown, "ok apos retry");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [15, 15]);
});

test("OpenAIWhisperTranscriber respeita numero maximo de retries", async () => {
  const config = createConfig();
  const delays: number[] = [];
  let attempts = 0;
  const client: OpenAIAudioClient = {
    transcribe: async () => {
      attempts += 1;
      throw new OpenAIAudioClientError({
        status: 503,
        message: "upstream falhou",
      });
    },
  };
  const transcriber = new OpenAIWhisperTranscriber(config, client, {
    maxRetries: 1,
    retryDelayMs: 10,
    delayFn: async (delayMs) => {
      delays.push(delayMs);
    },
  });

  await assert.rejects(async () => {
    await transcriber.transcribe({
      chunkIndex: 3,
      audioPath: "/tmp/chunk-0003.wav",
      startMs: 0,
      endMs: 60_000,
    });
  }, /upstream falhou/);

  assert.equal(attempts, 2);
  assert.deepEqual(delays, [10]);
});

test("OpenAIWhisperTranscriber nao mascara falha permanente", async () => {
  const config = createConfig();
  const delays: number[] = [];
  let attempts = 0;
  const client: OpenAIAudioClient = {
    transcribe: async () => {
      attempts += 1;
      throw new OpenAIAudioClientError({
        status: 400,
        message: "request invalido",
      });
    },
  };
  const transcriber = new OpenAIWhisperTranscriber(config, client, {
    maxRetries: 4,
    retryDelayMs: 10,
    delayFn: async (delayMs) => {
      delays.push(delayMs);
    },
  });

  await assert.rejects(async () => {
    await transcriber.transcribe({
      chunkIndex: 4,
      audioPath: "/tmp/chunk-0004.wav",
      startMs: 0,
      endMs: 60_000,
    });
  }, /request invalido/);

  assert.equal(attempts, 1);
  assert.deepEqual(delays, []);
});
