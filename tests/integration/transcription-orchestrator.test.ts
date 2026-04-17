import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { runCli } from "../../src/cli/main.js";
import { runTranscriptionJob } from "../../src/application/run-transcription-job.js";
import { type TranscriptionRequest, type TranscriptionResult } from "../../src/domain/entities/transcription-result.js";
import { type MediaSegmenter, type SegmentMediaInput, type SegmentMediaResult } from "../../src/domain/ports/media-segmenter.js";
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

class NoopSentinelTranscriber implements Transcriber {
  public readonly name = "fake";
  public readonly signature: string;
  public calls = 0;

  public constructor(signature: string) {
    this.signature = signature;
  }

  public async transcribe(_input: TranscriptionRequest): Promise<TranscriptionResult> {
    this.calls += 1;
    throw new Error("transcriber nao deve ser invocado no no-op de job succeeded");
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

function assertIsoTimestamp(value: string | null): asserts value is string {
  if (typeof value !== "string") {
    assert.fail("timestamp ISO esperado");
  }

  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  assert.equal(Number.isNaN(Date.parse(value)), false);
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
  assert.deepEqual(Object.keys(state).sort(), [
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
  assert.equal(state.version, 1);
  assert.equal(typeof state.jobId, "string");
  assert.notEqual(state.jobId.length, 0);
  assertIsoTimestamp(state.createdAt);
  assertIsoTimestamp(state.updatedAt);
  assert.equal(state.provider, input.provider);
  assert.equal(state.cleanupPolicy, input.cleanupPolicy);
  assert.equal(state.status, input.status);
  assert.equal(state.errorSummary, input.errorSummary);
  assert.equal(state.manifestPath, "manifest.json");
  assert.equal(state.finalMarkdownPath, input.finalMarkdownPath);

  assert.deepEqual(Object.keys(state.compatibility).sort(), [
    "chunkDurationSeconds",
    "inputMtimeMs",
    "inputSizeBytes",
    "provider",
    "resolvedInputPath",
    "transcriberSignature",
  ]);
  assert.equal(state.compatibility.resolvedInputPath, input.inputPath);
  assert.equal(state.compatibility.inputSizeBytes, input.inputSizeBytes);
  assert.equal(Math.trunc(state.compatibility.inputMtimeMs), Math.trunc(input.inputMtimeMs));
  assert.equal(state.compatibility.provider, input.provider);
  assert.equal(state.compatibility.transcriberSignature, input.transcriberSignature);
  assert.equal(state.compatibility.chunkDurationSeconds, 60);

  assert.equal(state.chunks.length, input.chunks.length);

  for (const [index, chunk] of state.chunks.entries()) {
    const expected = input.chunks[index]!;
    assert.deepEqual(Object.keys(chunk).sort(), [
      "attempts",
      "errorSummary",
      "finishedAt",
      "index",
      "markdownPath",
      "startedAt",
      "status",
    ]);
    assert.equal(chunk.index, expected.index);
    assert.equal(chunk.status, expected.status);
    assert.equal(chunk.attempts, expected.attempts);
    assert.equal(chunk.errorSummary, expected.errorSummary);
    assert.equal(chunk.markdownPath, expected.markdownPath);

    if (expected.startedAt === null) {
      assert.equal(chunk.startedAt, null);
    } else {
      assertIsoTimestamp(chunk.startedAt);
    }

    if (expected.finishedAt === null) {
      assert.equal(chunk.finishedAt, null);
    } else {
      assertIsoTimestamp(chunk.finishedAt);
    }
  }
}

test("CLI gera N markdowns parciais e consolidado final em ordem do manifesto", async (context) => {
  const root = await createTempDir("cli-e2e", context);
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

  assert.equal(exitCode, 0);

  const finalMarkdown = await readFile(join(outputDir, "transcript.md"), "utf8");
  assert.match(finalMarkdown, /# Chunk 0001[\s\S]*# Chunk 0002[\s\S]*# Chunk 0003/);

  await stat(join(outputDir, "transcripts/0001.md"));
  await stat(join(outputDir, "transcripts/0002.md"));
  await stat(join(outputDir, "transcripts/0003.md"));
});

test("falha parcial retorna exit code 2 e --resume reexecuta apenas o chunk falho", async (context) => {
  const root = await createTempDir("resume-partial", context);
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

  assert.equal(firstRun.exitCode, 2);
  assert.equal(firstRun.jobStatus, "partial_failed");

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

  assert.equal(resumedRun.exitCode, 0);

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

test("job ja sucedido vira no-op com --resume sem segmentar nem transcrever novamente", async (context) => {
  const root = await createTempDir("resume-succeeded-noop", context);
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

  assert.equal(firstRun.exitCode, 0);

  const stateBeforeNoop = await readFile(join(outputDir, "job-state.json"), "utf8");
  const finalMarkdownBeforeNoop = await readFile(join(outputDir, "transcript.md"), "utf8");
  const sentinelTranscriber = new NoopSentinelTranscriber(transcriberSignature);

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
    transcriber: sentinelTranscriber,
    logger,
  });

  assert.equal(resumed.exitCode, 0);
  assert.equal(resumed.jobStatus, "succeeded");
  assert.equal(sentinelTranscriber.calls, 0);
  assert.equal(await readFile(join(outputDir, "job-state.json"), "utf8"), stateBeforeNoop);
  assert.equal(await readFile(join(outputDir, "transcript.md"), "utf8"), finalMarkdownBeforeNoop);
});

test("sem --resume o outputDir ocupado falha antes de reaproveitar artefatos", async (context) => {
  const root = await createTempDir("no-resume", context);
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

  assert.equal(secondRun.exitCode, 1);
  assert.equal(stateBefore, stateAfter);
});

test("resume rejeita snapshot incompativel e recupera chunk running orfao", async (context) => {
  const root = await createTempDir("resume-snapshot", context);
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

  assert.equal(mismatch.exitCode, 1);

  const orphanRoot = await createTempDir("resume-orphan", context);
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

  assert.equal(resumed.exitCode, 0);

  const orphanState = JSON.parse(await readFile(join(orphanOutputDir, "job-state.json"), "utf8")) as {
    chunks: Array<{ index: number; attempts: number; status: string }>;
  };

  assert.equal(orphanState.chunks.find((chunk) => chunk.index === 2)?.attempts, 2);
  assert.equal(orphanState.chunks.find((chunk) => chunk.index === 2)?.status, "succeeded");
});
