import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

import { runCli } from "../../src/cli/main.js";
import { type OpenAITranscriptionConfig } from "../../src/infrastructure/providers/openai-transcription-config.js";
import {
  buildCliArgs,
  createFileJobStore,
  createInputFixture,
  createThreeChunkSegmenter,
  extractChunkNumber,
} from "../helpers/cli-harness.js";
import { createTempDir } from "../helpers/temp-dir.js";

describe("OpenAI transcription CLI", () => {
  describe("runCli integration", () => {
    it("conecta --provider openai-transcription com backend openai", async () => {
      const root = await createTempDir("openai-transcription-openai");
      const outputDir = join(root, "job");
      const inputPath = await createInputFixture(root);
      const capturedConfigs: OpenAITranscriptionConfig[] = [];

      const exitCode = await runCli(
        buildCliArgs({ inputs: [inputPath], outputDir, provider: "openai-transcription" }),
        {
          env: {
            OPENAI_API_KEY: "sk-test",
            OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
            OPENAI_TRANSCRIPTION_LANGUAGE: "pt",
            OPENAI_TRANSCRIPTION_PROMPT: "glossario",
          },
          createJobStore: (dir) => createFileJobStore(dir),
          createMediaSegmenter: () => createThreeChunkSegmenter(),
          createOpenAIAudioClient: (config) => {
            capturedConfigs.push(config as OpenAITranscriptionConfig);

            return {
              transcribe: async ({ audioPath, language, prompt }) => {
                expect(language).toBe("pt");
                expect(prompt).toBe("glossario");
                return { text: `Texto do chunk ${extractChunkNumber(audioPath)}` };
              },
            };
          },
        },
      );

      expect(exitCode).toBe(0);
      expect(capturedConfigs.length).toBe(1);
      expect(capturedConfigs[0]?.backend).toBe("openai");
      expect(capturedConfigs[0]?.model).toBe("gpt-4o-mini-transcribe");
      expect(capturedConfigs[0]?.requestModel).toBe("gpt-4o-mini-transcribe");
      expect(capturedConfigs[0]?.responseFormat).toBe("json");

      const state = JSON.parse(await readFile(join(outputDir, "job-state.json"), "utf8")) as {
        provider: string;
        compatibility: {
          provider: string;
          transcriberSignature: string;
        };
      };

      expect(state.provider).toBe("openai-transcription");
      expect(state.compatibility.provider).toBe("openai-transcription");
      expect(state.compatibility.transcriberSignature).toBe(capturedConfigs[0]?.transcriberSignature);
    });

    it("conecta --provider openai-transcription com backend azure", async () => {
      const root = await createTempDir("openai-transcription-azure");
      const outputDir = join(root, "job");
      const inputPath = await createInputFixture(root);
      let capturedConfig: OpenAITranscriptionConfig | undefined;

      const exitCode = await runCli(
        buildCliArgs({ inputs: [inputPath], outputDir, provider: "openai-transcription" }),
        {
          env: {
            OPENAI_TRANSCRIPTION_BACKEND: "azure",
            OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-transcribe",
            AZURE_OPENAI_API_KEY: "azure-key",
            AZURE_OPENAI_ENDPOINT: "https://example-resource.azure.openai.com/",
            OPENAI_API_VERSION: "2025-03-01-preview",
            AZURE_OPENAI_DEPLOYMENT: "transcribe-prod",
          },
          createJobStore: (dir) => createFileJobStore(dir),
          createMediaSegmenter: () => createThreeChunkSegmenter(),
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

      expect(exitCode).toBe(0);
      expect(capturedConfig?.backend).toBe("azure");
      expect(capturedConfig?.endpoint).toBe("https://example-resource.azure.openai.com");
      expect(capturedConfig?.apiVersion).toBe("2025-03-01-preview");
      expect(capturedConfig?.deployment).toBe("transcribe-prod");
      expect(capturedConfig?.requestModel).toBe("transcribe-prod");
    });
    it("rejeita --resume quando backend ou deployment mudam", async () => {
      const root = await createTempDir("openai-transcription-drift");
      const outputDir = join(root, "job");
      const inputPath = await createInputFixture(root);
      let transcribeCalls = 0;

      const firstRun = await runCli(
        buildCliArgs({ inputs: [inputPath], outputDir, provider: "openai-transcription" }),
        {
          env: {
            OPENAI_API_KEY: "sk-test",
            OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
          },
          createJobStore: (dir) => createFileJobStore(dir),
          createMediaSegmenter: () => createThreeChunkSegmenter(),
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
        buildCliArgs({ inputs: [inputPath], outputDir, provider: "openai-transcription", resume: true }),
        {
          env: {
            OPENAI_TRANSCRIPTION_BACKEND: "azure",
            OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
            AZURE_OPENAI_API_KEY: "azure-key",
            AZURE_OPENAI_ENDPOINT: "https://example-resource.azure.openai.com",
            OPENAI_API_VERSION: "2025-03-01-preview",
            AZURE_OPENAI_DEPLOYMENT: "transcribe-prod",
          },
          createJobStore: (dir) => createFileJobStore(dir),
          createMediaSegmenter: () => createThreeChunkSegmenter(),
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
