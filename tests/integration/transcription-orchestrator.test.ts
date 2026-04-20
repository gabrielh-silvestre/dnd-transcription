import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { setTimeout as delay } from "node:timers/promises";

import { runCli } from "../../src/cli/main.js";
import {
  RunTranscriptionJobUseCase,
  type RunTranscriptionJobUseCaseInput,
  type RunTranscriptionJobUseCaseResult,
} from "../../src/application/run-transcription-job-use-case.js";
import { type TranscriptionRequest, type TranscriptionResult } from "../../src/domain/entities/transcription-result.js";
import { type MediaSegmenter, type SegmentMediaInput, type SegmentMediaResult } from "../../src/domain/ports/media-segmenter.js";
import { bindTranscriber, type TranscriberBinding } from "../../src/domain/ports/transcriber-binding.js";
import { createTranscriberSignature, type Transcriber } from "../../src/domain/ports/transcriber.js";
import { FileJobStore } from "../../src/infrastructure/storage/file-job-store.js";
import { createLogger } from "../../src/shared/logger.js";
import { resolveJobPaths } from "../../src/shared/paths.js";
import { createTempDir } from "../helpers/temp-dir.js";
import { StubMediaSegmenter } from "../helpers/stub-media-segmenter.js";

class OrderedTranscriber implements Transcriber {
  public readonly name = "fake";
  public readonly signature = createTranscriberSignature({
    provider: "fake",
    variant: "ordered",
  });

  public async transcribe(input: TranscriptionRequest): Promise<TranscriptionResult> {
    const delayByChunk = new Map([
      [1, 40],
      [2, 20],
      [3, 5],
    ]);
    await delay(delayByChunk.get(input.chunkIndex) ?? 0);

    return {
      chunkIndex: input.chunkIndex,
      markdown: `Texto do chunk ${input.chunkIndex}`,
    };
  }
}

class ControlledTranscriber implements Transcriber {
  public readonly name = "fake";
  public readonly signature: string;
  private readonly failuresRemaining: Map<number, number>;

  public constructor(
    failuresRemaining: Record<number, number>,
    signature = createTranscriberSignature({
      provider: "fake",
      variant: "controlled",
    }),
  ) {
    this.failuresRemaining = new Map(Object.entries(failuresRemaining).map(([key, value]) => [Number(key), value]));
    this.signature = signature;
  }

  public async transcribe(input: TranscriptionRequest): Promise<TranscriptionResult> {
    const remaining = this.failuresRemaining.get(input.chunkIndex) ?? 0;

    if (remaining > 0) {
      this.failuresRemaining.set(input.chunkIndex, remaining - 1);
      throw new Error(`falha planejada para chunk ${input.chunkIndex}`);
    }

    return {
      chunkIndex: input.chunkIndex,
      markdown: `Markdown do chunk ${input.chunkIndex}`,
    };
  }
}

class NoopSentinelBinding implements TranscriberBinding {
  public readonly signature: string;
  public creations = 0;

  public constructor(signature: string) {
    this.signature = signature;
  }

  public createTranscriber(): Transcriber {
    this.creations += 1;
    throw new Error("binding nao deve materializar transcriber no no-op de job succeeded");
  }
}

class FailingSegmenter implements MediaSegmenter {
  public readonly name = "failing-segmenter";

  public async segment(_input: SegmentMediaInput): Promise<SegmentMediaResult> {
    throw new Error("segmenter nao deve ser invocado no no-op de job succeeded");
  }
}

interface PersistedCompatibilitySnapshot {
  resolvedInputPath: string;
  inputSizeBytes: number;
  inputMtimeMs: number;
  provider: string;
  transcriberSignature: string;
  chunkDurationSeconds: number;
}

interface PersistedChunkState {
  index: number;
  status: string;
  attempts: number;
  errorSummary: string | null;
  markdownPath: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

interface PersistedJobState {
  version: number;
  jobId: string;
  createdAt: string;
  updatedAt: string;
  provider: string;
  cleanupPolicy: string;
  status: string;
  errorSummary: string | null;
  manifestPath: string | null;
  finalMarkdownPath: string | null;
  compatibility: PersistedCompatibilitySnapshot;
  chunks: PersistedChunkState[];
}

interface RunTranscriptionJobInput extends Omit<RunTranscriptionJobUseCaseInput, "transcriberBinding"> {
  transcriber?: Transcriber;
  transcriberBinding?: TranscriberBinding;
}

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

async function readPersistedJobState(outputDir: string): Promise<PersistedJobState> {
  return JSON.parse(await readFile(join(outputDir, "job-state.json"), "utf8")) as PersistedJobState;
}

function resolveTranscriberBinding(input: Pick<RunTranscriptionJobInput, "transcriber" | "transcriberBinding">): TranscriberBinding {
  if (input.transcriberBinding !== undefined) {
    return input.transcriberBinding;
  }

  if (input.transcriber !== undefined) {
    return bindTranscriber(input.transcriber);
  }

  throw new Error("RunTranscriptionJob requer `transcriber` ou `transcriberBinding`.");
}

async function runTranscriptionJob(input: RunTranscriptionJobInput): Promise<RunTranscriptionJobUseCaseResult> {
  const { transcriber: _legacyTranscriber, transcriberBinding: _providedBinding, ...useCaseInput } = input;

  return await new RunTranscriptionJobUseCase().execute({
    ...useCaseInput,
    transcriberBinding: resolveTranscriberBinding(input),
  });
}

function assertIsoTimestamp(value: string | null): asserts value is string {
  if (typeof value !== "string") {
    throw new Error("timestamp ISO esperado");
  }

  expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  expect(Number.isNaN(Date.parse(value))).toBe(false);
}

function assertPersistedJobStateShape(
  state: PersistedJobState,
  input: {
    inputPath: string;
    inputSizeBytes: number;
    inputMtimeMs: number;
    provider: string;
    cleanupPolicy: string;
    transcriberSignature: string;
    status: string;
    errorSummary: string | null;
    finalMarkdownPath: string | null;
    chunks: PersistedChunkState[];
  },
): void {
  expect(Object.keys(state).sort()).toStrictEqual([
    "chunks",
    "cleanupPolicy",
    "compatibility",
    "createdAt",
    "errorSummary",
    "finalMarkdownPath",
    "jobId",
    "manifestPath",
    "provider",
    "status",
    "updatedAt",
    "version",
  ]);
  expect(state.version).toBe(1);
  expect(typeof state.jobId).toBe("string");
  expect(state.jobId.length).not.toBe(0);
  assertIsoTimestamp(state.createdAt);
  assertIsoTimestamp(state.updatedAt);
  expect(state.provider).toBe(input.provider);
  expect(state.cleanupPolicy).toBe(input.cleanupPolicy);
  expect(state.status).toBe(input.status);
  expect(state.errorSummary).toBe(input.errorSummary);
  expect(state.manifestPath).toBe("manifest.json");
  expect(state.finalMarkdownPath).toBe(input.finalMarkdownPath);

  expect(Object.keys(state.compatibility).sort()).toStrictEqual([
    "chunkDurationSeconds",
    "inputMtimeMs",
    "inputSizeBytes",
    "provider",
    "resolvedInputPath",
    "transcriberSignature",
  ]);
  expect(state.compatibility.resolvedInputPath).toBe(input.inputPath);
  expect(state.compatibility.inputSizeBytes).toBe(input.inputSizeBytes);
  expect(Math.trunc(state.compatibility.inputMtimeMs)).toBe(Math.trunc(input.inputMtimeMs));
  expect(state.compatibility.provider).toBe(input.provider);
  expect(state.compatibility.transcriberSignature).toBe(input.transcriberSignature);
  expect(state.compatibility.chunkDurationSeconds).toBe(60);

  expect(state.chunks.length).toBe(input.chunks.length);

  for (const [index, chunk] of state.chunks.entries()) {
    const expected = input.chunks[index]!;
    expect(Object.keys(chunk).sort()).toStrictEqual([
      "attempts",
      "errorSummary",
      "finishedAt",
      "index",
      "markdownPath",
      "startedAt",
      "status",
    ]);
    expect(chunk.index).toBe(expected.index);
    expect(chunk.status).toBe(expected.status);
    expect(chunk.attempts).toBe(expected.attempts);
    expect(chunk.errorSummary).toBe(expected.errorSummary);
    expect(chunk.markdownPath).toBe(expected.markdownPath);

    if (expected.startedAt === null) {
      expect(chunk.startedAt).toBeNull();
    } else {
      assertIsoTimestamp(chunk.startedAt);
    }

    if (expected.finishedAt === null) {
      expect(chunk.finishedAt).toBeNull();
    } else {
      assertIsoTimestamp(chunk.finishedAt);
    }
  }
}

describe("Transcription orchestrator", () => {
    it("gera N markdowns parciais e consolidado final em ordem do manifesto", async () => {
      const root = await createTempDir("cli-e2e");
      const outputDir = join(root, "job");
      const inputPath = await createInputFixture(root);
      const exitCode = await runCli(
        [
          "--input",
          inputPath,
          "--output",
          outputDir,
          "--chunk-duration-seconds",
          "60",
          "--concurrency",
          "3",
          "--provider",
          "fake",
          "--cleanup-policy",
          "keep",
        ],
        {
          createJobStore: (dir) => new FileJobStore(resolveJobPaths(dir)),
          createMediaSegmenter: () => createSegmenter(),
          createTranscriber: () => new OrderedTranscriber(),
        },
      );

      expect(exitCode).toBe(0);

      const finalMarkdown = await readFile(join(outputDir, "transcript.md"), "utf8");
      expect(finalMarkdown).toMatch(/# Chunk 0001[\s\S]*# Chunk 0002[\s\S]*# Chunk 0003/);

      await stat(join(outputDir, "transcripts/0001.md"));
      await stat(join(outputDir, "transcripts/0002.md"));
      await stat(join(outputDir, "transcripts/0003.md"));
    });

  describe("resume behavior", () => {
    it("falha parcial retorna exit code 2 e --resume reexecuta apenas o chunk falho", async () => {
      const root = await createTempDir("resume-partial");
      const outputDir = join(root, "job");
      const inputPath = await createInputFixture(root);
      const inputStats = await stat(inputPath);
      const jobStore = new FileJobStore(resolveJobPaths(outputDir));
      const logger = createLogger();
      const transcriberSignature = createTranscriberSignature({
        provider: "fake",
        variant: "controlled",
      });

      const firstRun = await runTranscriptionJob({
        inputPath,
        outputDir,
        chunkDurationSeconds: 60,
        chunkDurationMs: 60_000,
        concurrency: 2,
        provider: "fake",
        cleanupPolicy: "keep",
        resume: false,
        jobStore,
        mediaSegmenter: createSegmenter(),
        transcriber: new ControlledTranscriber({ 2: 1 }, transcriberSignature),
        logger,
      });

      expect(firstRun.exitCode).toBe(2);
      expect(firstRun.jobStatus).toBe("partial_failed");

      const failedStateBeforeResume = await readPersistedJobState(outputDir);
      assertPersistedJobStateShape(failedStateBeforeResume, {
        inputPath,
        inputSizeBytes: inputStats.size,
        inputMtimeMs: inputStats.mtimeMs,
        provider: "fake",
        cleanupPolicy: "keep",
        transcriberSignature,
        status: "partial_failed",
        errorSummary: "Uma ou mais transcricoes falharam; o job pode ser retomado com --resume.",
        finalMarkdownPath: null,
        chunks: [
          {
            index: 1,
            status: "succeeded",
            attempts: 1,
            errorSummary: null,
            markdownPath: "transcripts/0001.md",
            startedAt: "iso",
            finishedAt: "iso",
          },
          {
            index: 2,
            status: "failed",
            attempts: 1,
            errorSummary: "falha planejada para chunk 2",
            markdownPath: null,
            startedAt: "iso",
            finishedAt: "iso",
          },
          {
            index: 3,
            status: "succeeded",
            attempts: 1,
            errorSummary: null,
            markdownPath: "transcripts/0003.md",
            startedAt: "iso",
            finishedAt: "iso",
          },
        ],
      });

      const resumedRun = await runTranscriptionJob({
        inputPath,
        outputDir,
        chunkDurationSeconds: 60,
        chunkDurationMs: 60_000,
        concurrency: 2,
        provider: "fake",
        cleanupPolicy: "keep",
        resume: true,
        jobStore,
        mediaSegmenter: createSegmenter(),
        transcriber: new ControlledTranscriber({}, transcriberSignature),
        logger,
      });

      expect(resumedRun.exitCode).toBe(0);

      const stateAfterResume = await readPersistedJobState(outputDir);
      assertPersistedJobStateShape(stateAfterResume, {
        inputPath,
        inputSizeBytes: inputStats.size,
        inputMtimeMs: inputStats.mtimeMs,
        provider: "fake",
        cleanupPolicy: "keep",
        transcriberSignature,
        status: "succeeded",
        errorSummary: null,
        finalMarkdownPath: "transcript.md",
        chunks: [
          {
            index: 1,
            status: "succeeded",
            attempts: 1,
            errorSummary: null,
            markdownPath: "transcripts/0001.md",
            startedAt: "iso",
            finishedAt: "iso",
          },
          {
            index: 2,
            status: "succeeded",
            attempts: 2,
            errorSummary: null,
            markdownPath: "transcripts/0002.md",
            startedAt: "iso",
            finishedAt: "iso",
          },
          {
            index: 3,
            status: "succeeded",
            attempts: 1,
            errorSummary: null,
            markdownPath: "transcripts/0003.md",
            startedAt: "iso",
            finishedAt: "iso",
          },
        ],
      });
    });

    it("job ja sucedido vira no-op com --resume sem segmentar nem transcrever novamente", async () => {
      const root = await createTempDir("resume-succeeded-noop");
      const outputDir = join(root, "job");
      const inputPath = await createInputFixture(root);
      const jobStore = new FileJobStore(resolveJobPaths(outputDir));
      const logger = createLogger();
      const transcriberSignature = createTranscriberSignature({
        provider: "fake",
        variant: "controlled",
      });

      const firstRun = await runTranscriptionJob({
        inputPath,
        outputDir,
        chunkDurationSeconds: 60,
        chunkDurationMs: 60_000,
        concurrency: 2,
        provider: "fake",
        cleanupPolicy: "keep",
        resume: false,
        jobStore,
        mediaSegmenter: createSegmenter(),
        transcriber: new ControlledTranscriber({}, transcriberSignature),
        logger,
      });

      expect(firstRun.exitCode).toBe(0);

      const stateBeforeNoop = await readFile(join(outputDir, "job-state.json"), "utf8");
      const finalMarkdownBeforeNoop = await readFile(join(outputDir, "transcript.md"), "utf8");
      const sentinelBinding = new NoopSentinelBinding(transcriberSignature);

      const resumed = await runTranscriptionJob({
        inputPath,
        outputDir,
        chunkDurationSeconds: 60,
        chunkDurationMs: 60_000,
        concurrency: 2,
        provider: "fake",
        cleanupPolicy: "keep",
        resume: true,
        jobStore,
        mediaSegmenter: new FailingSegmenter(),
        transcriberBinding: sentinelBinding,
        logger,
      });

      expect(resumed.exitCode).toBe(0);
      expect(resumed.jobStatus).toBe("succeeded");
      expect(sentinelBinding.creations).toBe(0);
      expect(await readFile(join(outputDir, "job-state.json"), "utf8")).toBe(stateBeforeNoop);
      expect(await readFile(join(outputDir, "transcript.md"), "utf8")).toBe(finalMarkdownBeforeNoop);
    });
    it("rejeita snapshot incompativel e recupera chunk running orfao", async () => {
      const root = await createTempDir("resume-snapshot");
      const outputDir = join(root, "job");
      const inputPath = await createInputFixture(root);
      const logger = createLogger();
      const jobStore = new FileJobStore(resolveJobPaths(outputDir));

      await runTranscriptionJob({
        inputPath,
        outputDir,
        chunkDurationSeconds: 60,
        chunkDurationMs: 60_000,
        concurrency: 2,
        provider: "fake",
        cleanupPolicy: "keep",
        resume: false,
        jobStore,
        mediaSegmenter: createSegmenter(),
        transcriber: new ControlledTranscriber({}),
        logger,
      });

      const mismatch = await runTranscriptionJob({
        inputPath,
        outputDir,
        chunkDurationSeconds: 120,
        chunkDurationMs: 120_000,
        concurrency: 2,
        provider: "fake",
        cleanupPolicy: "keep",
        resume: true,
        jobStore,
        mediaSegmenter: createSegmenter(),
        transcriber: new ControlledTranscriber(
          {},
          createTranscriberSignature({
            provider: "fake",
            variant: "controlled",
            prompt: "contexto-alterado",
          }),
        ),
        logger,
      });

      expect(mismatch.exitCode).toBe(1);

      const orphanRoot = await createTempDir("resume-orphan");
      const orphanOutputDir = join(orphanRoot, "job");
      const orphanInputPath = await createInputFixture(orphanRoot);
      const orphanStore = new FileJobStore(resolveJobPaths(orphanOutputDir));

      await orphanStore.initializeJob({
        jobId: "job-orphan",
        provider: "fake",
        cleanupPolicy: "keep",
        compatibility: {
          resolvedInputPath: orphanInputPath,
          inputSizeBytes: 7,
          inputMtimeMs: (await stat(orphanInputPath)).mtimeMs,
          provider: "fake",
          transcriberSignature: createTranscriberSignature({
            provider: "fake",
            variant: "controlled",
          }),
          chunkDurationSeconds: 60,
        },
      });

      const segmenter = createSegmenter();
      const segmentation = await segmenter.segment({
        inputPath: orphanInputPath,
        jobRootDir: orphanStore.paths.rootDir,
        workingDir: orphanStore.paths.chunksDir,
        chunkDurationMs: 60_000,
      });

      await orphanStore.updateJobStatus("segmenting");
      await orphanStore.writeManifest(segmentation.manifest);
      await orphanStore.hydrateChunksFromManifest(segmentation.manifest);
      await orphanStore.updateJobStatus("ready");
      await orphanStore.updateJobStatus("running");
      const markdownPath = await orphanStore.writeChunkMarkdown(1, "# Chunk 0001\n\nok\n");
      await orphanStore.markChunkRunning(1);
      await orphanStore.markChunkSucceeded(1, markdownPath);
      await orphanStore.markChunkRunning(2);

      const resumed = await runTranscriptionJob({
        inputPath: orphanInputPath,
        outputDir: orphanOutputDir,
        chunkDurationSeconds: 60,
        chunkDurationMs: 60_000,
        concurrency: 2,
        provider: "fake",
        cleanupPolicy: "keep",
        resume: true,
        jobStore: orphanStore,
        mediaSegmenter: createSegmenter(),
        transcriber: new ControlledTranscriber({}),
        logger,
      });

      expect(resumed.exitCode).toBe(0);

      const orphanState = JSON.parse(await readFile(join(orphanOutputDir, "job-state.json"), "utf8")) as {
        chunks: Array<{ index: number; attempts: number; status: string }>;
      };

      expect(orphanState.chunks.find((chunk) => chunk.index === 2)?.attempts).toBe(2);
      expect(orphanState.chunks.find((chunk) => chunk.index === 2)?.status).toBe("succeeded");
    });
  });

  it("sem --resume o outputDir ocupado falha antes de reaproveitar artefatos", async () => {
    const root = await createTempDir("no-resume");
    const outputDir = join(root, "job");
    const inputPath = await createInputFixture(root);
    const logger = createLogger();
    const jobStore = new FileJobStore(resolveJobPaths(outputDir));

    await runTranscriptionJob({
      inputPath,
      outputDir,
      chunkDurationSeconds: 60,
      chunkDurationMs: 60_000,
      concurrency: 2,
      provider: "fake",
      cleanupPolicy: "keep",
      resume: false,
      jobStore,
      mediaSegmenter: createSegmenter(),
      transcriber: new ControlledTranscriber({ 2: 1 }),
      logger,
    });

    const stateBefore = await readFile(join(outputDir, "job-state.json"), "utf8");
    const secondRun = await runTranscriptionJob({
      inputPath,
      outputDir,
      chunkDurationSeconds: 60,
      chunkDurationMs: 60_000,
      concurrency: 2,
      provider: "fake",
      cleanupPolicy: "keep",
      resume: false,
      jobStore,
      mediaSegmenter: createSegmenter(),
      transcriber: new ControlledTranscriber({}),
      logger,
    });
    const stateAfter = await readFile(join(outputDir, "job-state.json"), "utf8");

    expect(secondRun.exitCode).toBe(1);
    expect(stateBefore).toBe(stateAfter);
  });
});
