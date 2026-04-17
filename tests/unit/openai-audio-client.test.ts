import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import OpenAI, { AzureOpenAI } from "openai";

import {
  classifyOpenAIAudioError,
  createOpenAIAudioSdk,
  DefaultOpenAIAudioClient,
  OpenAIAudioClientError,
  type OpenAIAudioCreateRequest,
  type OpenAIAudioSdkLike,
} from "../../src/infrastructure/providers/openai-audio-client.js";
import { createTempDir } from "../helpers/temp-dir.js";

test("DefaultOpenAIAudioClient monta request com whisper-1 e response_format json", async (context) => {
  const root = await createTempDir("openai-client", context);
  const audioPath = join(root, "chunk.wav");
  await writeFile(audioPath, "audio", "utf8");

  let capturedRequest: OpenAIAudioCreateRequest | undefined;

  const sdk: OpenAIAudioSdkLike = {
    audio: {
      transcriptions: {
        create: async (request) => {
          capturedRequest = request;
          return { text: "texto transcrito", usage: { type: "duration", seconds: 1 } };
        },
      },
    },
  };

  const client = new DefaultOpenAIAudioClient(
    {
      backend: "openai",
      apiKey: "sk-test",
      model: "whisper-1",
      requestModel: "whisper-1",
      responseFormat: "json",
      endpoint: null,
      apiVersion: null,
      deployment: null,
    },
    sdk,
  );
  const response = await client.transcribe({
    audioPath,
    language: "pt",
    prompt: "glossario",
  });

  assert.deepEqual(response, { text: "texto transcrito" });
  assert.equal(capturedRequest?.model, "whisper-1");
  assert.equal(capturedRequest?.response_format, "json");
  assert.equal(capturedRequest?.language, "pt");
  assert.equal(capturedRequest?.prompt, "glossario");
  assert.equal((capturedRequest?.file as { path?: string }).path, audioPath);
});

test("DefaultOpenAIAudioClient normaliza erro retryable do SDK", async (context) => {
  const root = await createTempDir("openai-client-error", context);
  const audioPath = join(root, "chunk.wav");
  await writeFile(audioPath, "audio", "utf8");

  const sdk: OpenAIAudioSdkLike = {
    audio: {
      transcriptions: {
        create: async () => {
          throw {
            status: 429,
            message: "rate limited",
          };
        },
      },
    },
  };

  const client = new DefaultOpenAIAudioClient(
    {
      backend: "openai",
      apiKey: "sk-test",
      model: "whisper-1",
      requestModel: "whisper-1",
      responseFormat: "json",
      endpoint: null,
      apiVersion: null,
      deployment: null,
    },
    sdk,
  );

  await assert.rejects(async () => {
    await client.transcribe({ audioPath });
  }, (error: unknown) => {
    assert.equal(error instanceof OpenAIAudioClientError, true);
    assert.equal((error as OpenAIAudioClientError).retryable, true);
    assert.match((error as Error).message, /rate limited/);
    return true;
  });
});

test("classifyOpenAIAudioError distingue erro retryable de permanente", () => {
  assert.deepEqual(classifyOpenAIAudioError({ status: 503 }), { retryable: true });
  assert.deepEqual(classifyOpenAIAudioError({ name: "APIConnectionTimeoutError" }), { retryable: true });
  assert.deepEqual(classifyOpenAIAudioError({ status: 400 }), { retryable: false });
});

test("createOpenAIAudioSdk instancia OpenAI ou AzureOpenAI conforme o backend", () => {
  const openaiSdk = createOpenAIAudioSdk({
    backend: "openai",
    apiKey: "sk-test",
    model: "gpt-4o-mini-transcribe",
    requestModel: "gpt-4o-mini-transcribe",
    responseFormat: "json",
    endpoint: null,
    apiVersion: null,
    deployment: null,
  });
  const azureSdk = createOpenAIAudioSdk({
    backend: "azure",
    apiKey: "azure-key",
    model: "gpt-4o-transcribe",
    requestModel: "transcribe-prod",
    responseFormat: "json",
    endpoint: "https://example-resource.azure.openai.com",
    apiVersion: "2025-03-01-preview",
    deployment: "transcribe-prod",
  });

  assert.equal(openaiSdk instanceof OpenAI, true);
  assert.equal(azureSdk instanceof AzureOpenAI, true);
});
