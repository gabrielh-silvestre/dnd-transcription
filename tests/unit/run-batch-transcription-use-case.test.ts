import { describe, expect, it } from "@jest/globals";

import {
  RunBatchTranscriptionUseCase,
  type BatchIndexEntry,
  type BatchIndexWriter,
  type RunBatchTranscriptionUseCaseInput,
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
import { deriveJobSubdir } from "../../src/shared/paths.js";

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

interface RecordingExecutorOptions {
  resultByPath?: Map<string, RunTranscriptionJobUseCaseResult>;
  rejectPaths?: Set<string>;
  delayMs?: number;
}

class RecordingExecutor implements RunTranscriptionJobExecutorLike {
  public readonly calls: RunTranscriptionJobUseCaseInput[] = [];
  public inFlight = 0;
  public maxInFlight = 0;

  public constructor(private readonly options: RecordingExecutorOptions = {}) {}

  public async execute(input: RunTranscriptionJobUseCaseInput): Promise<RunTranscriptionJobUseCaseResult> {
    this.calls.push(input);
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);

    try {
      if (this.options.delayMs !== undefined) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, this.options.delayMs));
      }

      if (this.options.rejectPaths?.has(input.inputPath)) {
        throw new Error(`rejeicao planejada para ${input.inputPath}`);
      }

      return this.options.resultByPath?.get(input.inputPath) ?? successResult();
    } finally {
      this.inFlight -= 1;
    }
  }
}

class RecordingIndexWriter implements BatchIndexWriter {
  public calls: Array<{ outputDir: string; entries: BatchIndexEntry[] }> = [];

  public async write(outputDir: string, entries: BatchIndexEntry[]): Promise<void> {
    this.calls.push({ outputDir, entries });
  }
}

interface SilentLoggerSpy extends Logger {
  warnCalls: Array<{ scope: string; message: string }>;
}

function createLoggerSpy(): SilentLoggerSpy {
  const warnCalls: Array<{ scope: string; message: string }> = [];

  return {
    warnCalls,
    info() {},
    warn(scope, message) {
      warnCalls.push({ scope, message });
    },
    error() {},
  };
}

function fakeJobStore(hasArtifacts = false): JobStore {
  return {
    async hasPersistedJobArtifacts() {
      return hasArtifacts;
    },
  } as unknown as JobStore;
}

const fakeSegmenter = {} as unknown as MediaSegmenter;
const fakeBinding = {} as unknown as TranscriberBinding;

function createInput(
  overrides: Partial<RunBatchTranscriptionUseCaseInput> & { inputPaths: string[] },
): RunBatchTranscriptionUseCaseInput {
  return {
    outputDir: "/out",
    chunkDurationSeconds: 60,
    chunkDurationMs: 60_000,
    concurrency: 2,
    fileConcurrency: 2,
    provider: "fake",
    cleanupPolicy: "keep",
    resume: false,
    createJobStore: () => fakeJobStore(),
    createMediaSegmenter: () => fakeSegmenter,
    createTranscriberBinding: () => fakeBinding,
    logger: createLoggerSpy(),
    ...overrides,
  };
}

describe("RunBatchTranscriptionUseCase", () => {
  it("processa 3 arquivos com sucesso, retorna exit 0 e escreve o indice em ordem", async () => {
    const executor = new RecordingExecutor();
    const indexWriter = new RecordingIndexWriter();
    const useCase = new RunBatchTranscriptionUseCase({ executor, batchIndexWriter: indexWriter });
    const inputPaths = ["/a.mkv", "/b.mkv", "/c.mkv"];

    const result = await useCase.execute(createInput({ inputPaths }));

    expect(result.exitCode).toBe(0);
    expect(indexWriter.calls).toHaveLength(1);
    expect(indexWriter.calls[0]!.entries).toHaveLength(3);
    expect(indexWriter.calls[0]!.entries.map((entry) => entry.inputPath)).toStrictEqual(inputPaths);

    for (const [index, path] of inputPaths.entries()) {
      const entry = indexWriter.calls[0]!.entries[index]!;
      expect(entry.subdir).toBe(deriveJobSubdir(path));
      expect(result.fileResults[index]!.subdir).toBe(deriveJobSubdir(path));
    }
  });

  it("propaga exit 2 quando um arquivo retorna falha parcial e os demais sucesso", async () => {
    const resultByPath = new Map([["/b.mkv", resultWithExit(2)]]);
    const executor = new RecordingExecutor({ resultByPath });
    const useCase = new RunBatchTranscriptionUseCase({
      executor,
      batchIndexWriter: new RecordingIndexWriter(),
    });

    const result = await useCase.execute(createInput({ inputPaths: ["/a.mkv", "/b.mkv", "/c.mkv"] }));

    expect(result.exitCode).toBe(2);
  });

  it("prioriza exit 1 sobre exit 2 na agregacao", async () => {
    const resultByPath = new Map([
      ["/a.mkv", resultWithExit(1)],
      ["/b.mkv", resultWithExit(2)],
    ]);
    const executor = new RecordingExecutor({ resultByPath });
    const useCase = new RunBatchTranscriptionUseCase({
      executor,
      batchIndexWriter: new RecordingIndexWriter(),
    });

    const result = await useCase.execute(createInput({ inputPaths: ["/a.mkv", "/b.mkv", "/c.mkv"] }));

    expect(result.exitCode).toBe(1);
  });

  it("converte um executor que rejeita em resultado fatal sem interromper os demais", async () => {
    const executor = new RecordingExecutor({ rejectPaths: new Set(["/b.mkv"]) });
    const useCase = new RunBatchTranscriptionUseCase({
      executor,
      batchIndexWriter: new RecordingIndexWriter(),
    });
    const inputPaths = ["/a.mkv", "/b.mkv", "/c.mkv"];

    const result = await useCase.execute(createInput({ inputPaths }));

    const failed = result.fileResults.find((fileResult) => fileResult.inputPath === "/b.mkv");
    expect(failed?.exitCode).toBe(1);
    expect(failed?.jobStatus).toBe("fatal_error");
    expect(executor.calls.map((call) => call.inputPath).sort()).toStrictEqual([...inputPaths].sort());
  });

  it("converte um factory que lanca em resultado fatal sem interromper os demais", async () => {
    const executor = new RecordingExecutor();
    const useCase = new RunBatchTranscriptionUseCase({
      executor,
      batchIndexWriter: new RecordingIndexWriter(),
    });
    const inputPaths = ["/a.mkv", "/b.mkv", "/c.mkv"];

    const result = await useCase.execute(
      createInput({
        inputPaths,
        createMediaSegmenter: (path) => {
          if (path === "/b.mkv") {
            throw new Error("falha de factory");
          }

          return fakeSegmenter;
        },
      }),
    );

    const failed = result.fileResults.find((fileResult) => fileResult.inputPath === "/b.mkv");
    expect(failed?.exitCode).toBe(1);
    expect(executor.calls.map((call) => call.inputPath).sort()).toStrictEqual(["/a.mkv", "/c.mkv"]);

    const others = result.fileResults.filter((fileResult) => fileResult.inputPath !== "/b.mkv");
    expect(others.every((fileResult) => fileResult.exitCode === 0)).toBe(true);
  });

  it("respeita o limite de file-concurrency 1", async () => {
    const executor = new RecordingExecutor({ delayMs: 5 });
    const useCase = new RunBatchTranscriptionUseCase({
      executor,
      batchIndexWriter: new RecordingIndexWriter(),
    });

    await useCase.execute(createInput({ inputPaths: ["/a.mkv", "/b.mkv", "/c.mkv"], fileConcurrency: 1 }));

    expect(executor.maxInFlight).toBe(1);
  });

  it("permite paralelismo quando file-concurrency e maior", async () => {
    const executor = new RecordingExecutor({ delayMs: 5 });
    const useCase = new RunBatchTranscriptionUseCase({
      executor,
      batchIndexWriter: new RecordingIndexWriter(),
    });

    await useCase.execute(createInput({ inputPaths: ["/a.mkv", "/b.mkv", "/c.mkv"], fileConcurrency: 3 }));

    expect(executor.maxInFlight).toBe(3);
  });

  it("inicia do zero arquivos sem artefatos mesmo com --resume", async () => {
    const executor = new RecordingExecutor();
    const useCase = new RunBatchTranscriptionUseCase({
      executor,
      batchIndexWriter: new RecordingIndexWriter(),
    });

    await useCase.execute(
      createInput({
        inputPaths: ["/x.mkv", "/y.mkv"],
        resume: true,
        createJobStore: (_dir, resolvedInputPath) => fakeJobStore(resolvedInputPath === "/y.mkv"),
      }),
    );

    const callX = executor.calls.find((call) => call.inputPath === "/x.mkv");
    const callY = executor.calls.find((call) => call.inputPath === "/y.mkv");
    expect(callX?.resume).toBe(false);
    expect(callY?.resume).toBe(true);
  });

  it("deduplica caminhos identicos e invoca o executor uma unica vez", async () => {
    const executor = new RecordingExecutor();
    const useCase = new RunBatchTranscriptionUseCase({
      executor,
      batchIndexWriter: new RecordingIndexWriter(),
    });

    const result = await useCase.execute(createInput({ inputPaths: ["/dup.mkv", "/dup.mkv"] }));

    expect(executor.calls).toHaveLength(1);
    expect(result.fileResults).toHaveLength(1);
  });

  it("emite warn de guardrail quando file-concurrency x concurrency > 16", async () => {
    const logger = createLoggerSpy();
    const executor = new RecordingExecutor();
    const useCase = new RunBatchTranscriptionUseCase({
      executor,
      batchIndexWriter: new RecordingIndexWriter(),
    });

    await useCase.execute(
      createInput({ inputPaths: ["/a.mkv", "/b.mkv"], fileConcurrency: 5, concurrency: 5, logger }),
    );

    const batchWarns = logger.warnCalls.filter((call) => call.scope === "batch");
    expect(batchWarns).toHaveLength(1);
  });

  it("nao emite warn de guardrail quando file-concurrency x concurrency <= 16", async () => {
    const logger = createLoggerSpy();
    const executor = new RecordingExecutor();
    const useCase = new RunBatchTranscriptionUseCase({
      executor,
      batchIndexWriter: new RecordingIndexWriter(),
    });

    await useCase.execute(
      createInput({ inputPaths: ["/a.mkv", "/b.mkv"], fileConcurrency: 4, concurrency: 4, logger }),
    );

    const batchWarns = logger.warnCalls.filter((call) => call.scope === "batch");
    expect(batchWarns).toHaveLength(0);
  });

  it("nao escreve o indice quando ha apenas um caminho deduplicado", async () => {
    const indexWriter = new RecordingIndexWriter();
    const useCase = new RunBatchTranscriptionUseCase({
      executor: new RecordingExecutor(),
      batchIndexWriter: indexWriter,
    });

    const result = await useCase.execute(createInput({ inputPaths: ["/solo.mkv", "/solo.mkv"] }));

    expect(indexWriter.calls).toHaveLength(0);
    expect(result.fileResults[0]!.subdir).toBeNull();
  });
});
