import assert from "node:assert/strict";
import test from "node:test";

import {
  TranscriptionCliApplication,
  type CliArgumentParserLike,
  type InputPathResolverLike,
} from "../../src/cli/transcription-cli-application.js";
import { type CliOptions } from "../../src/cli/cli-argument-parser.js";
import { type RunTranscriptionJobInput } from "../../src/application/run-transcription-job.js";
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

test("TranscriptionCliApplication retorna help sem carregar env nem executar o job", async () => {
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
      runTranscriptionJob: async () => {
        executions += 1;
        return {
          exitCode: 0,
          jobStatus: "succeeded",
          failedChunks: [],
          finalMarkdownPath: null,
          errorSummary: null,
        };
      },
      writeStdout: (text) => {
        stdout += text;
      },
    },
  );

  const exitCode = await application.run(["--help"]);

  assert.equal(exitCode, 0);
  assert.equal(stdout, "uso de teste");
  assert.equal(envLoads, 0);
  assert.equal(executions, 0);
});

test("TranscriptionCliApplication preserva o seam legado createTranscriber", async () => {
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

  let capturedInput: RunTranscriptionJobInput | undefined;

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
      runTranscriptionJob: async (input) => {
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
  );

  const exitCode = await application.run([]);

  assert.equal(exitCode, 0);
  assert.equal(capturedInput?.inputPath, "/normalized/input.mkv");
  assert.equal(capturedInput?.jobStore, jobStore);
  assert.equal(capturedInput?.mediaSegmenter, mediaSegmenter);
  assert.equal(capturedInput?.transcriberBinding?.signature, transcriber.signature);

  const boundTranscriber = capturedInput?.transcriberBinding?.createTranscriber();
  assert.equal(boundTranscriber instanceof Promise, false);
  assert.equal(boundTranscriber, transcriber);
});
