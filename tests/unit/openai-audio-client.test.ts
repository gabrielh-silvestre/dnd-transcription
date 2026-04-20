import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

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

describe("OpenAI audio client", () => {
  it("monta request com whisper-1 e response_format json", async () => {
    const root = await createTempDir("openai-client");
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

    expect(response).toStrictEqual({ text: "texto transcrito" });
    expect(capturedRequest?.model).toBe("whisper-1");
    expect(capturedRequest?.response_format).toBe("json");
    expect(capturedRequest?.language).toBe("pt");
    expect(capturedRequest?.prompt).toBe("glossario");
    expect((capturedRequest?.file as { path?: string }).path).toBe(audioPath);
  });

  it("normaliza erro retryable do SDK", async () => {
    const root = await createTempDir("openai-client-error");
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

    const transcriptionPromise = client.transcribe({ audioPath });

    await expect(transcriptionPromise).rejects.toBeInstanceOf(OpenAIAudioClientError);
    await expect(transcriptionPromise).rejects.toMatchObject({ retryable: true });
    await expect(transcriptionPromise).rejects.toThrow(/rate limited/);
  });

  it("distingue erro retryable de permanente", () => {
    expect(classifyOpenAIAudioError({ status: 503 })).toStrictEqual({ retryable: true });
    expect(classifyOpenAIAudioError({ name: "APIConnectionTimeoutError" })).toStrictEqual({ retryable: true });
    expect(classifyOpenAIAudioError({ status: 400 })).toStrictEqual({ retryable: false });
  });

  it("instancia OpenAI ou AzureOpenAI conforme o backend", () => {
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

    expect(openaiSdk).toBeInstanceOf(OpenAI);
    expect(azureSdk).toBeInstanceOf(AzureOpenAI);
  });
});
