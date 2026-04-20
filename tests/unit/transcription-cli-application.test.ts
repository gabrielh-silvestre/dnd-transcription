import { describe, expect, it } from "@jest/globals";

import {
  TranscriptionCliApplication,
  type CliArgumentParserLike,
  type InputPathResolverLike,
} from "../../src/cli/transcription-cli-application.js";
import { type CliOptions } from "../../src/cli/cli-argument-parser.js";
import { type RunTranscriptionJobUseCaseInput } from "../../src/application/run-transcription-job-use-case.js";
import { type JobStore } from "../../src/domain/ports/job-store.js";
import { type MediaSegmenter } from "../../src/domain/ports/media-segmenter.js";
import { createTranscriberSignature, type Transcriber } from "../../src/domain/ports/transcriber.js";
import { type Logger } from "../../src/shared/logger.js";
import { resolveJobPaths } from "../../src/shared/paths.js";

function createCliOptions(): CliOptions {
  return {
    inputPath: "input.mkv",
    outputDir: "./tmp/job",
    chunkDurationSeconds: 60,
    chunkDurationMs: 60_000,
    concurrency: 2,
    provider: "fake",
    cleanupPolicy: "keep",
    resume: false,
  };
}

function createSilentLogger(): Logger {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

describe("Transcription CLI application", () => {
  it("retorna help sem carregar env nem executar o job", async () => {
    let envLoads = 0;
    let executions = 0;
    let stdout = "";

    const argumentParser: CliArgumentParserLike = {
      parse() {
        return {
          kind: "help",
          text: "uso de teste",
        };
      },
    };

    const application = new TranscriptionCliApplication(
      {
        createLogger: createSilentLogger,
      },
      {
        argumentParser,
        loadEnvFile: async () => {
          envLoads += 1;
          return {};
        },
        runTranscriptionJobUseCase: {
          execute: async () => {
            executions += 1;
            return {
              exitCode: 0,
              jobStatus: "succeeded",
              failedChunks: [],
              finalMarkdownPath: null,
              errorSummary: null,
            };
          },
        },
        writeStdout: (text) => {
          stdout += text;
        },
      },
    );

    const exitCode = await application.run(["--help"]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe("uso de teste");
    expect(envLoads).toBe(0);
    expect(executions).toBe(0);
  });

  it("preserva o seam legado createTranscriber", async () => {
    const options = createCliOptions();
    const inputPathResolver: InputPathResolverLike = {
      resolve() {
        return "/normalized/input.mkv";
      },
    };
    const argumentParser: CliArgumentParserLike = {
      parse() {
        return {
          kind: "run",
          options,
        };
      },
    };
    const transcriber: Transcriber = {
      name: "legacy-fake",
      signature: createTranscriberSignature({
        provider: "fake",
        variant: "legacy-seam",
      }),
      async transcribe() {
        return {
          chunkIndex: 1,
          markdown: "noop",
        };
      },
    };
    const jobStore = {
      paths: resolveJobPaths("./tmp/job"),
    } as unknown as JobStore;
    const mediaSegmenter = {
      name: "segmenter",
    } as unknown as MediaSegmenter;

    let capturedInput: RunTranscriptionJobUseCaseInput | undefined;

    const application = new TranscriptionCliApplication(
      {
        createLogger: createSilentLogger,
        createJobStore: () => jobStore,
        createMediaSegmenter: () => mediaSegmenter,
        createTranscriber: () => transcriber,
      },
      {
        argumentParser,
        inputPathResolver,
        loadEnvFile: async () => ({}),
        runTranscriptionJobUseCase: {
          execute: async (input) => {
            capturedInput = input;

            return {
              exitCode: 0,
              jobStatus: "succeeded",
              failedChunks: [],
              finalMarkdownPath: "./tmp/job/transcript.md",
              errorSummary: null,
            };
          },
        },
      },
    );

    const exitCode = await application.run([]);

    expect(exitCode).toBe(0);
    expect(capturedInput?.inputPath).toBe("/normalized/input.mkv");
    expect(capturedInput?.jobStore).toBe(jobStore);
    expect(capturedInput?.mediaSegmenter).toBe(mediaSegmenter);
    expect(capturedInput?.transcriberBinding?.signature).toBe(transcriber.signature);

    const boundTranscriber = capturedInput?.transcriberBinding?.createTranscriber();
    expect(boundTranscriber instanceof Promise).toBe(false);
    expect(boundTranscriber).toBe(transcriber);
  });
});
