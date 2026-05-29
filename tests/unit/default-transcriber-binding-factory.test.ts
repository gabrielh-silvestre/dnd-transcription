import { describe, expect, it } from "@jest/globals";

import {
  DefaultTranscriberBindingFactory,
} from "../../src/cli/default-transcriber-binding-factory.js";
import { type CliOptions } from "../../src/cli/cli-argument-parser.js";
import { createFakeTranscriberSignature, FakeTranscriber } from "../../src/infrastructure/providers/fake-transcriber.js";
import { type OpenAIAudioClient } from "../../src/infrastructure/providers/openai-audio-client.js";

function createCliOptions(provider: string): CliOptions {
  return {
    inputPaths: ["./input.mkv"],
    outputDir: "./tmp/job",
    chunkDurationSeconds: 60,
    chunkDurationMs: 60_000,
    concurrency: 2,
    fileConcurrency: 1,
    provider,
    cleanupPolicy: "keep",
    resume: false,
  };
}

describe("Default transcriber binding factory", () => {
  it("adia a criacao do client OpenAI ate materializar o transcriber", () => {
    const options = createCliOptions("openai-whisper");
    let clientCreations = 0;

    const binding = new DefaultTranscriberBindingFactory({
      env: {
        OPENAI_API_KEY: "sk-test",
      },
      createOpenAIAudioClient: () => {
        clientCreations += 1;

        const client: OpenAIAudioClient = {
          transcribe: async () => ({ text: "ok" }),
        };

        return client;
      },
    }).create(options);

    expect(clientCreations).toBe(0);

    const transcriber = binding.createTranscriber();
    expect(transcriber instanceof Promise).toBe(false);
    expect(clientCreations).toBe(1);

    if (transcriber instanceof Promise) {
      throw new Error("Resultado inesperado");
    }

    expect(transcriber.signature).toBe(binding.signature);
  });

  it("preserva o caminho sincrono do provider fake", () => {
    const options = createCliOptions("fake");
    const env = {
      FAKE_TRANSCRIBER_LATENCY_MS: "0",
    };

    const binding = new DefaultTranscriberBindingFactory({ env }).create(options);
    const transcriber = binding.createTranscriber();

    expect(transcriber instanceof Promise).toBe(false);

    if (transcriber instanceof Promise) {
      throw new Error("Resultado inesperado");
    }

    expect(binding.signature).toBe(createFakeTranscriberSignature({ latencyMs: 0, failChunkIndexes: [] }));
    expect(transcriber).toBeInstanceOf(FakeTranscriber);
    expect(transcriber.signature).toBe(binding.signature);
  });
});
