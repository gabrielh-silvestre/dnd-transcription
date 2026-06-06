import process from "node:process";

import { describe, expect, it } from "@jest/globals";

import {
  runTranscriptionCore,
  type TranscriptionCoreInput,
  type TranscriptionRequest,
} from "../../src/core/transcription-core.js";
import {
  type BatchIndexEntry,
  type BatchIndexWriter,
  type RunTranscriptionJobExecutorLike,
} from "../../src/application/run-batch-transcription-use-case.js";
import {
  type RunTranscriptionJobUseCaseInput,
  type RunTranscriptionJobUseCaseResult,
} from "../../src/application/run-transcription-job-use-case.js";
import { type JobStore } from "../../src/domain/ports/job-store.js";
import { type MediaSegmenter } from "../../src/domain/ports/media-segmenter.js";
import { type TranscriberBinding } from "../../src/domain/ports/transcriber-binding.js";
import { type Logger } from "../../src/shared/logger.js";

function successResult(): RunTranscriptionJobUseCaseResult {
  return {
    exitCode: 0,
    jobStatus: "succeeded",
    failedChunks: [],
    finalMarkdownPath: "transcript.md",
    errorSummary: null,
  };
}

function resultWithExit(exitCode: 0 | 1 | 2): RunTranscriptionJobUseCaseResult {
  if (exitCode === 0) {
    return successResult();
  }

  return {
    exitCode,
    jobStatus: exitCode === 2 ? "partial_failed" : "fatal_error",
    failedChunks: exitCode === 2 ? [1] : [],
    finalMarkdownPath: null,
    errorSummary: exitCode === 1 ? "fatal" : null,
  };
}

class RecordingExecutor implements RunTranscriptionJobExecutorLike {
  public readonly calls: RunTranscriptionJobUseCaseInput[] = [];

  public constructor(private readonly resultByPath: Map<string, RunTranscriptionJobUseCaseResult> = new Map()) {}

  public async execute(input: RunTranscriptionJobUseCaseInput): Promise<RunTranscriptionJobUseCaseResult> {
    this.calls.push(input);
    return this.resultByPath.get(input.inputPath) ?? successResult();
  }
}

class RecordingIndexWriter implements BatchIndexWriter {
  public calls: Array<{ outputDir: string; entries: BatchIndexEntry[] }> = [];

  public async write(outputDir: string, entries: BatchIndexEntry[]): Promise<void> {
    this.calls.push({ outputDir, entries });
  }
}

function createSilentLogger(): Logger {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

const fakeJobStore = {
  async hasPersistedJobArtifacts() {
    return false;
  },
} as unknown as JobStore;
const fakeSegmenter = {} as unknown as MediaSegmenter;
const fakeBinding = {} as unknown as TranscriberBinding;

function createRequest(overrides: Partial<TranscriptionRequest> & { inputs: string[] }): TranscriptionRequest {
  return {
    output: "/out",
    chunkDurationSeconds: 60,
    concurrency: 2,
    fileConcurrency: 1,
    cleanupPolicy: "keep",
    resume: false,
    ...overrides,
  };
}

function createCoreInput(
  overrides: Partial<TranscriptionCoreInput> & { request: TranscriptionRequest },
): TranscriptionCoreInput {
  return {
    provider: "fake",
    chunkDurationMs: 60_000,
    logger: createSilentLogger(),
    createTranscriberBinding: () => fakeBinding,
    createJobStore: () => fakeJobStore,
    createMediaSegmenter: () => fakeSegmenter,
    runTranscriptionJobUseCase: new RecordingExecutor(),
    batchIndexWriter: new RecordingIndexWriter(),
    ...overrides,
  };
}

describe("runTranscriptionCore", () => {
  it("compoe o batch use case e devolve o resultado estruturado intacto (2 inputs fake)", async () => {
    const executor = new RecordingExecutor();
    const indexWriter = new RecordingIndexWriter();

    const result = await runTranscriptionCore(
      createCoreInput({
        request: createRequest({ inputs: ["/a.mkv", "/b.mkv"] }),
        runTranscriptionJobUseCase: executor,
        batchIndexWriter: indexWriter,
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.fileResults).toHaveLength(2);
    expect(result.fileResults.map((file) => file.inputPath)).toStrictEqual(["/a.mkv", "/b.mkv"]);
    // Multi-input => batch index written.
    expect(indexWriter.calls).toHaveLength(1);
    expect(indexWriter.calls[0]!.entries).toHaveLength(2);
  });

  it("devolve fileResults populado para 1 input (layout flat, sem indice)", async () => {
    const indexWriter = new RecordingIndexWriter();

    const result = await runTranscriptionCore(
      createCoreInput({
        request: createRequest({ inputs: ["/solo.mkv"] }),
        batchIndexWriter: indexWriter,
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.fileResults).toHaveLength(1);
    expect(result.fileResults[0]!.subdir).toBeNull();
    expect(indexWriter.calls).toHaveLength(0);
  });

  it("NUNCA chama process.stdout.write (logger injetado e o unico canal)", async () => {
    const original = process.stdout.write.bind(process.stdout);
    let writes = 0;
    const spy = ((...args: unknown[]) => {
      writes += 1;
      return (original as unknown as (...a: unknown[]) => boolean)(...args);
    }) as unknown as typeof process.stdout.write;
    process.stdout.write = spy;

    try {
      await runTranscriptionCore(
        createCoreInput({ request: createRequest({ inputs: ["/a.mkv", "/b.mkv"] }) }),
      );
    } finally {
      process.stdout.write = original;
    }

    expect(writes).toBe(0);
  });

  it("propaga o provider injetado (precedencia de binding via input.provider)", async () => {
    const executor = new RecordingExecutor();

    await runTranscriptionCore(
      createCoreInput({
        request: createRequest({ inputs: ["/a.mkv"] }),
        provider: "openai-whisper",
        runTranscriptionJobUseCase: executor,
      }),
    );

    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0]!.provider).toBe("openai-whisper");
  });

  it("usa o createTranscriberBinding injetado (precedencia do thunk) por arquivo", async () => {
    const bindingPaths: string[] = [];
    const executor = new RecordingExecutor();

    await runTranscriptionCore(
      createCoreInput({
        request: createRequest({ inputs: ["/a.mkv", "/b.mkv"] }),
        runTranscriptionJobUseCase: executor,
        createTranscriberBinding: (resolvedInputPath) => {
          bindingPaths.push(resolvedInputPath);
          return fakeBinding;
        },
      }),
    );

    expect(bindingPaths.sort()).toStrictEqual(["/a.mkv", "/b.mkv"]);
  });

  it.each([0, 1, 2] as const)("faz passthrough do exitCode agregado %i sem alteracao", async (exitCode) => {
    const executor = new RecordingExecutor(new Map([["/a.mkv", resultWithExit(exitCode)]]));

    const result = await runTranscriptionCore(
      createCoreInput({
        request: createRequest({ inputs: ["/a.mkv"] }),
        runTranscriptionJobUseCase: executor,
      }),
    );

    expect(result.exitCode).toBe(exitCode);
  });

  it("repassa chunkDurationSeconds e chunkDurationMs para o use case", async () => {
    const executor = new RecordingExecutor();

    await runTranscriptionCore(
      createCoreInput({
        request: createRequest({ inputs: ["/a.mkv"], chunkDurationSeconds: 90 }),
        chunkDurationMs: 90_000,
        runTranscriptionJobUseCase: executor,
      }),
    );

    expect(executor.calls[0]!.chunkDurationSeconds).toBe(90);
    expect(executor.calls[0]!.chunkDurationMs).toBe(90_000);
  });
});
