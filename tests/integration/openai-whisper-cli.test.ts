import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "../../src/cli/main.js";
import { OpenAIAudioClientError, type OpenAIAudioClient } from "../../src/infrastructure/providers/openai-audio-client.js";
import { type OpenAIWhisperConfig } from "../../src/infrastructure/providers/openai-whisper-config.js";
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

test("CLI conecta --provider openai-whisper com client stubado", async (context) => {
  const root = await createTempDir("openai-whisper-cli", context);
  const outputDir = join(root, "job");
  const inputPath = await createInputFixture(root);
  const capturedConfigs: OpenAIWhisperConfig[] = [];
  const capturedCalls: Array<{ audioPath: string; language?: string; prompt?: string }> = [];

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
      "openai-whisper",
      "--cleanup-policy",
      "keep",
    ],
    {
      env: {
        OPENAI_API_KEY: "sk-test",
        OPENAI_WHISPER_LANGUAGE: "pt",
        OPENAI_WHISPER_PROMPT: "glossario",
      },
      createJobStore: (dir) => new FileJobStore(resolveJobPaths(dir)),
      createMediaSegmenter: () => createSegmenter(),
      createOpenAIAudioClient: (config) => {
        capturedConfigs.push(config as OpenAIWhisperConfig);

        const client: OpenAIAudioClient = {
          transcribe: async (input) => {
            capturedCalls.push(input);
            return { text: `Texto do chunk ${extractChunkNumber(input.audioPath)}` };
          },
        };

        return client;
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(capturedConfigs.length, 1);
  assert.equal(capturedConfigs[0]?.provider, "openai-whisper");
  assert.equal(capturedConfigs[0]?.model, "whisper-1");
  assert.equal(capturedConfigs[0]?.responseFormat, "json");
  assert.equal(capturedCalls.length, 3);
  assert.equal(capturedCalls[0]?.language, "pt");
  assert.equal(capturedCalls[0]?.prompt, "glossario");

  const state = JSON.parse(await readFile(join(outputDir, "job-state.json"), "utf8")) as {
    provider: string;
    compatibility: {
      provider: string;
      transcriberSignature: string;
    };
  };

  assert.equal(state.provider, "openai-whisper");
  assert.equal(state.compatibility.provider, "openai-whisper");
  assert.equal(state.compatibility.transcriberSignature, capturedConfigs[0]?.transcriberSignature);

  const finalMarkdown = await readFile(join(outputDir, "transcript.md"), "utf8");
  assert.match(finalMarkdown, /Texto do chunk 1/);
  assert.match(finalMarkdown, /Texto do chunk 2/);
  assert.match(finalMarkdown, /Texto do chunk 3/);
});

test("CLI carrega .env nativamente para o provider openai-whisper", async (context) => {
  const root = await createTempDir("openai-whisper-dotenv", context);
  const outputDir = join(root, "job");
  const inputPath = await createInputFixture(root);
  await writeFile(join(root, ".env"), [
    "OPENAI_API_KEY=sk-from-dotenv",
    "OPENAI_WHISPER_LANGUAGE=pt",
    "OPENAI_WHISPER_PROMPT=glossario-via-dotenv",
  ].join("\n"), "utf8");

  let capturedConfig: OpenAIWhisperConfig | undefined;
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
      "openai-whisper",
      "--cleanup-policy",
      "keep",
    ],
    {
      cwd: root,
      createJobStore: (dir) => new FileJobStore(resolveJobPaths(dir)),
      createMediaSegmenter: () => createSegmenter(),
      createOpenAIAudioClient: (config) => {
        capturedConfig = config as OpenAIWhisperConfig;

        return {
          transcribe: async ({ audioPath, language, prompt }) => {
            assert.equal(language, "pt");
            assert.equal(prompt, "glossario-via-dotenv");
            return { text: `Texto do chunk ${extractChunkNumber(audioPath)}` };
          },
        };
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(capturedConfig?.apiKey, "sk-from-dotenv");
  assert.equal(capturedConfig?.prompt, "glossario-via-dotenv");
});

test("openai-whisper suporta falha parcial seguida de --resume com mesma assinatura", async (context) => {
  const root = await createTempDir("openai-whisper-resume", context);
  const outputDir = join(root, "job");
  const inputPath = await createInputFixture(root);
  const failuresRemaining = new Map<number, number>([[2, 3]]);

  const createClient = (): OpenAIAudioClient => ({
    transcribe: async ({ audioPath, language, prompt }) => {
      assert.equal(language, "pt");
      assert.equal(prompt, "glossario");

      const chunkIndex = extractChunkNumber(audioPath);
      const remaining = failuresRemaining.get(chunkIndex) ?? 0;

      if (remaining > 0) {
        failuresRemaining.set(chunkIndex, remaining - 1);
        throw new OpenAIAudioClientError({
          status: 429,
          message: `falha planejada no chunk ${chunkIndex}`,
        });
      }

      return { text: `Texto do chunk ${chunkIndex}` };
    },
  });

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
      "openai-whisper",
      "--cleanup-policy",
      "keep",
    ],
    {
      env: {
        OPENAI_API_KEY: "sk-test",
        OPENAI_WHISPER_LANGUAGE: "pt",
        OPENAI_WHISPER_PROMPT: "glossario",
      },
      createJobStore: (dir) => new FileJobStore(resolveJobPaths(dir)),
      createMediaSegmenter: () => createSegmenter(),
      createOpenAIAudioClient: () => createClient(),
    },
  );

  assert.equal(firstRun, 2);

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
      "openai-whisper",
      "--cleanup-policy",
      "keep",
      "--resume",
    ],
    {
      env: {
        OPENAI_API_KEY: "sk-test",
        OPENAI_WHISPER_LANGUAGE: "pt",
        OPENAI_WHISPER_PROMPT: "glossario",
      },
      createJobStore: (dir) => new FileJobStore(resolveJobPaths(dir)),
      createMediaSegmenter: () => createSegmenter(),
      createOpenAIAudioClient: () => createClient(),
    },
  );

  assert.equal(resumedRun, 0);

  const state = JSON.parse(await readFile(join(outputDir, "job-state.json"), "utf8")) as {
    status: string;
    chunks: Array<{ index: number; attempts: number; status: string }>;
  };

  assert.equal(state.status, "succeeded");
  assert.equal(state.chunks.find((chunk) => chunk.index === 1)?.attempts, 1);
  assert.equal(state.chunks.find((chunk) => chunk.index === 2)?.attempts, 2);
  assert.equal(state.chunks.find((chunk) => chunk.index === 3)?.attempts, 1);
});

test("openai-whisper rejeita --resume quando a assinatura do provider muda", async (context) => {
  const root = await createTempDir("openai-whisper-drift", context);
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
      "openai-whisper",
      "--cleanup-policy",
      "keep",
    ],
    {
      env: {
        OPENAI_API_KEY: "sk-test",
        OPENAI_WHISPER_PROMPT: "glossario-a",
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
      "openai-whisper",
      "--cleanup-policy",
      "keep",
      "--resume",
    ],
    {
      env: {
        OPENAI_API_KEY: "sk-test",
        OPENAI_WHISPER_PROMPT: "glossario-b",
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
