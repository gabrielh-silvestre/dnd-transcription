import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "../../src/cli/main.js";
import { type OpenAITranscriptionConfig } from "../../src/infrastructure/providers/openai-transcription-config.js";
import { FileJobStore } from "../../src/infrastructure/storage/file-job-store.js";
import { resolveJobPaths } from "../../src/shared/paths.js";
import { StubMediaSegmenter } from "../helpers/stub-media-segmenter.js";
import { createTempDir } from "../helpers/temp-dir.js";

function createSegmenter(): StubMediaSegmenter {
  return new StubMediaSegmenter({
    totalDurationMs: 180_000,
    chunks: [
      { index: 1, startMs: 0, endMs: 60_000 },
      { index: 2, startMs: 60_000, endMs: 120_000 },
      { index: 3, startMs: 120_000, endMs: 180_000 },
    ],
  });
}

async function createInputFixture(root: string): Promise<string> {
  const inputPath = join(root, "input.mkv");
  await writeFile(inputPath, "fixture", "utf8");
  return inputPath;
}

function extractChunkNumber(audioPath: string): number {
  const match = /(\d+)\.wav$/u.exec(audioPath);

  if (match === null) {
    throw new Error(`Nao foi possivel inferir chunk de ${audioPath}`);
  }

  return Number(match[1]);
}

test("CLI conecta --provider openai-transcription com backend openai", async (context) => {
  const root = await createTempDir("openai-transcription-openai", context);
  const outputDir = join(root, "job");
  const inputPath = await createInputFixture(root);
  const capturedConfigs: OpenAITranscriptionConfig[] = [];

  const exitCode = await runCli(
    [
      "--input",
      inputPath,
      "--output",
      outputDir,
      "--chunk-duration-seconds",
      "60",
      "--concurrency",
      "2",
      "--provider",
      "openai-transcription",
      "--cleanup-policy",
      "keep",
    ],
    {
      env: {
        OPENAI_API_KEY: "sk-test",
        OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
        OPENAI_TRANSCRIPTION_LANGUAGE: "pt",
        OPENAI_TRANSCRIPTION_PROMPT: "glossario",
      },
      createJobStore: (dir) => new FileJobStore(resolveJobPaths(dir)),
      createMediaSegmenter: () => createSegmenter(),
      createOpenAIAudioClient: (config) => {
        capturedConfigs.push(config as OpenAITranscriptionConfig);

        return {
          transcribe: async ({ audioPath, language, prompt }) => {
            assert.equal(language, "pt");
            assert.equal(prompt, "glossario");
            return { text: `Texto do chunk ${extractChunkNumber(audioPath)}` };
          },
        };
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(capturedConfigs.length, 1);
  assert.equal(capturedConfigs[0]?.backend, "openai");
  assert.equal(capturedConfigs[0]?.model, "gpt-4o-mini-transcribe");
  assert.equal(capturedConfigs[0]?.requestModel, "gpt-4o-mini-transcribe");
  assert.equal(capturedConfigs[0]?.responseFormat, "json");

  const state = JSON.parse(await readFile(join(outputDir, "job-state.json"), "utf8")) as {
    provider: string;
    compatibility: {
      provider: string;
      transcriberSignature: string;
    };
  };

  assert.equal(state.provider, "openai-transcription");
  assert.equal(state.compatibility.provider, "openai-transcription");
  assert.equal(state.compatibility.transcriberSignature, capturedConfigs[0]?.transcriberSignature);
});

test("CLI conecta --provider openai-transcription com backend azure", async (context) => {
  const root = await createTempDir("openai-transcription-azure", context);
  const outputDir = join(root, "job");
  const inputPath = await createInputFixture(root);
  let capturedConfig: OpenAITranscriptionConfig | undefined;

  const exitCode = await runCli(
    [
      "--input",
      inputPath,
      "--output",
      outputDir,
      "--chunk-duration-seconds",
      "60",
      "--concurrency",
      "2",
      "--provider",
      "openai-transcription",
      "--cleanup-policy",
      "keep",
    ],
    {
      env: {
        OPENAI_TRANSCRIPTION_BACKEND: "azure",
        OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-transcribe",
        AZURE_OPENAI_API_KEY: "azure-key",
        AZURE_OPENAI_ENDPOINT: "https://example-resource.azure.openai.com/",
        OPENAI_API_VERSION: "2025-03-01-preview",
        AZURE_OPENAI_DEPLOYMENT: "transcribe-prod",
      },
      createJobStore: (dir) => new FileJobStore(resolveJobPaths(dir)),
      createMediaSegmenter: () => createSegmenter(),
      createOpenAIAudioClient: (config) => {
        capturedConfig = config as OpenAITranscriptionConfig;

        return {
          transcribe: async ({ audioPath }) => ({
            text: `Texto do chunk ${extractChunkNumber(audioPath)}`,
          }),
        };
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(capturedConfig?.backend, "azure");
  assert.equal(capturedConfig?.endpoint, "https://example-resource.azure.openai.com");
  assert.equal(capturedConfig?.apiVersion, "2025-03-01-preview");
  assert.equal(capturedConfig?.deployment, "transcribe-prod");
  assert.equal(capturedConfig?.requestModel, "transcribe-prod");
});

test("openai-transcription rejeita --resume quando backend ou deployment mudam", async (context) => {
  const root = await createTempDir("openai-transcription-drift", context);
  const outputDir = join(root, "job");
  const inputPath = await createInputFixture(root);
  let transcribeCalls = 0;

  const firstRun = await runCli(
    [
      "--input",
      inputPath,
      "--output",
      outputDir,
      "--chunk-duration-seconds",
      "60",
      "--concurrency",
      "2",
      "--provider",
      "openai-transcription",
      "--cleanup-policy",
      "keep",
    ],
    {
      env: {
        OPENAI_API_KEY: "sk-test",
        OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
      },
      createJobStore: (dir) => new FileJobStore(resolveJobPaths(dir)),
      createMediaSegmenter: () => createSegmenter(),
      createOpenAIAudioClient: () => ({
        transcribe: async ({ audioPath }) => {
          transcribeCalls += 1;
          return { text: `Texto do chunk ${extractChunkNumber(audioPath)}` };
        },
      }),
    },
  );

  assert.equal(firstRun, 0);

  transcribeCalls = 0;

  const resumedRun = await runCli(
    [
      "--input",
      inputPath,
      "--output",
      outputDir,
      "--chunk-duration-seconds",
      "60",
      "--concurrency",
      "2",
      "--provider",
      "openai-transcription",
      "--cleanup-policy",
      "keep",
      "--resume",
    ],
    {
      env: {
        OPENAI_TRANSCRIPTION_BACKEND: "azure",
        OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
        AZURE_OPENAI_API_KEY: "azure-key",
        AZURE_OPENAI_ENDPOINT: "https://example-resource.azure.openai.com",
        OPENAI_API_VERSION: "2025-03-01-preview",
        AZURE_OPENAI_DEPLOYMENT: "transcribe-prod",
      },
      createJobStore: (dir) => new FileJobStore(resolveJobPaths(dir)),
      createMediaSegmenter: () => createSegmenter(),
      createOpenAIAudioClient: () => ({
        transcribe: async ({ audioPath }) => {
          transcribeCalls += 1;
          return { text: `Texto do chunk ${extractChunkNumber(audioPath)}` };
        },
      }),
    },
  );

  assert.equal(resumedRun, 1);
  assert.equal(transcribeCalls, 0);
});
