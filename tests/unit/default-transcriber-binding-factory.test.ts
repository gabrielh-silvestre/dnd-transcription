import assert from "node:assert/strict";
import test from "node:test";

import {
  DefaultTranscriberBindingFactory,
} from "../../src/cli/default-transcriber-binding-factory.js";
import { type CliOptions } from "../../src/cli/cli-argument-parser.js";
import { createFakeTranscriberSignature, FakeTranscriber } from "../../src/infrastructure/providers/fake-transcriber.js";
import { type OpenAIAudioClient } from "../../src/infrastructure/providers/openai-audio-client.js";

function createCliOptions(provider: string): CliOptions {
  return {
    inputPath: "./input.mkv",
    outputDir: "./tmp/job",
    chunkDurationSeconds: 60,
    chunkDurationMs: 60_000,
    concurrency: 2,
    provider,
    cleanupPolicy: "keep",
    resume: false,
  };
}

test("DefaultTranscriberBindingFactory adia a criacao do client OpenAI ate materializar o transcriber", () => {
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

  assert.equal(clientCreations, 0);

  const transcriber = binding.createTranscriber();
  assert.equal(transcriber instanceof Promise, false);
  assert.equal(clientCreations, 1);

  if (transcriber instanceof Promise) {
    throw new Error("Resultado inesperado");
  }

  assert.equal(transcriber.signature, binding.signature);
});

test("DefaultTranscriberBindingFactory preserva o caminho sincrono do provider fake", () => {
  const options = createCliOptions("fake");
  const env = {
    FAKE_TRANSCRIBER_LATENCY_MS: "0",
  };

  const binding = new DefaultTranscriberBindingFactory({ env }).create(options);
  const transcriber = binding.createTranscriber();

  assert.equal(transcriber instanceof Promise, false);

  if (transcriber instanceof Promise) {
    throw new Error("Resultado inesperado");
  }

  assert.equal(binding.signature, createFakeTranscriberSignature({ latencyMs: 0, failChunkIndexes: [] }));
  assert.ok(transcriber instanceof FakeTranscriber);
  assert.equal(transcriber.signature, binding.signature);
});
