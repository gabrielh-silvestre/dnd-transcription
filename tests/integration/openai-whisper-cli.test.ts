import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

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

describe("OpenAI whisper CLI", () => {
  it("conecta --provider openai-whisper com client stubado", async () => {
      const root = await createTempDir("openai-whisper-cli");
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

      expect(exitCode).toBe(0);
      expect(capturedConfigs.length).toBe(1);
      expect(capturedConfigs[0]?.provider).toBe("openai-whisper");
      expect(capturedConfigs[0]?.model).toBe("whisper-1");
      expect(capturedConfigs[0]?.responseFormat).toBe("json");
      expect(capturedCalls.length).toBe(3);
      expect(capturedCalls[0]?.language).toBe("pt");
      expect(capturedCalls[0]?.prompt).toBe("glossario");

      const state = JSON.parse(await readFile(join(outputDir, "job-state.json"), "utf8")) as {
        provider: string;
        compatibility: {
          provider: string;
          transcriberSignature: string;
        };
      };

      expect(state.provider).toBe("openai-whisper");
      expect(state.compatibility.provider).toBe("openai-whisper");
      expect(state.compatibility.transcriberSignature).toBe(capturedConfigs[0]?.transcriberSignature);

      const finalMarkdown = await readFile(join(outputDir, "transcript.md"), "utf8");
      expect(finalMarkdown).toMatch(/Texto do chunk 1/);
      expect(finalMarkdown).toMatch(/Texto do chunk 2/);
      expect(finalMarkdown).toMatch(/Texto do chunk 3/);
  });

  it("carrega .env nativamente para o provider openai-whisper", async () => {
      const root = await createTempDir("openai-whisper-dotenv");
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
                expect(language).toBe("pt");
                expect(prompt).toBe("glossario-via-dotenv");
                return { text: `Texto do chunk ${extractChunkNumber(audioPath)}` };
              },
            };
          },
        },
      );

      expect(exitCode).toBe(0);
      expect(capturedConfig?.apiKey).toBe("sk-from-dotenv");
      expect(capturedConfig?.prompt).toBe("glossario-via-dotenv");
  });

  describe("resume behavior", () => {
    it("suporta falha parcial seguida de --resume com mesma assinatura", async () => {
      const root = await createTempDir("openai-whisper-resume");
      const outputDir = join(root, "job");
      const inputPath = await createInputFixture(root);
      const failuresRemaining = new Map<number, number>([[2, 3]]);

      const createClient = (): OpenAIAudioClient => ({
        transcribe: async ({ audioPath, language, prompt }) => {
          expect(language).toBe("pt");
          expect(prompt).toBe("glossario");

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

      expect(firstRun).toBe(2);

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

      expect(resumedRun).toBe(0);

      const state = JSON.parse(await readFile(join(outputDir, "job-state.json"), "utf8")) as {
        status: string;
        chunks: Array<{ index: number; attempts: number; status: string }>;
      };

      expect(state.status).toBe("succeeded");
      expect(state.chunks.find((chunk) => chunk.index === 1)?.attempts).toBe(1);
      expect(state.chunks.find((chunk) => chunk.index === 2)?.attempts).toBe(2);
      expect(state.chunks.find((chunk) => chunk.index === 3)?.attempts).toBe(1);
    });

    it("nao cria client no no-op de job sucedido com --resume", async () => {
      const root = await createTempDir("openai-whisper-noop");
      const outputDir = join(root, "job");
      const inputPath = await createInputFixture(root);
      const env = {
        OPENAI_API_KEY: "sk-test",
        OPENAI_WHISPER_LANGUAGE: "pt",
        OPENAI_WHISPER_PROMPT: "glossario",
      };

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
          env,
          createJobStore: (dir) => new FileJobStore(resolveJobPaths(dir)),
          createMediaSegmenter: () => createSegmenter(),
          createOpenAIAudioClient: () => ({
            transcribe: async ({ audioPath }) => ({
              text: `Texto do chunk ${extractChunkNumber(audioPath)}`,
            }),
          }),
        },
      );

      expect(firstRun).toBe(0);

      let clientCreations = 0;
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
          env,
          createJobStore: (dir) => new FileJobStore(resolveJobPaths(dir)),
          createMediaSegmenter: () => createSegmenter(),
          createOpenAIAudioClient: () => {
            clientCreations += 1;
            throw new Error("client nao deveria ser criado no no-op de job succeeded");
          },
        },
      );

      expect(resumedRun).toBe(0);
      expect(clientCreations).toBe(0);
    });
    it("rejeita --resume quando a assinatura do provider muda", async () => {
      const root = await createTempDir("openai-whisper-drift");
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

      expect(firstRun).toBe(0);

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

      expect(resumedRun).toBe(1);
      expect(transcribeCalls).toBe(0);
    });
  });
});
