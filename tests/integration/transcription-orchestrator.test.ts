import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { runCli } from "../../src/cli/main.js";
import { runTranscriptionJob } from "../../src/application/run-transcription-job.js";
import { type TranscriptionRequest, type TranscriptionResult } from "../../src/domain/entities/transcription-result.js";
import { type Transcriber } from "../../src/domain/ports/transcriber.js";
import { FileJobStore } from "../../src/infrastructure/storage/file-job-store.js";
import { createLogger } from "../../src/shared/logger.js";
import { resolveJobPaths } from "../../src/shared/paths.js";
import { createTempDir } from "../helpers/temp-dir.js";
import { StubMediaSegmenter } from "../helpers/stub-media-segmenter.js";

class OrderedTranscriber implements Transcriber {
  public readonly name = "ordered";

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
  public readonly name = "controlled";
  private readonly failuresRemaining: Map<number, number>;

  public constructor(failuresRemaining: Record<number, number>) {
    this.failuresRemaining = new Map(Object.entries(failuresRemaining).map(([key, value]) => [Number(key), value]));
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
  const jobStore = new FileJobStore(resolveJobPaths(outputDir));
  const logger = createLogger();

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
    transcriber: new ControlledTranscriber({ 2: 1 }),
    logger,
  });

  assert.equal(firstRun.exitCode, 2);
  assert.equal(firstRun.jobStatus, "partial_failed");

  const failedStateBeforeResume = JSON.parse(await readFile(join(outputDir, "job-state.json"), "utf8")) as {
    status: string;
    chunks: Array<{ index: number; attempts: number; status: string }>;
  };

  assert.equal(failedStateBeforeResume.status, "partial_failed");
  assert.equal(failedStateBeforeResume.chunks.find((chunk) => chunk.index === 1)?.attempts, 1);
  assert.equal(failedStateBeforeResume.chunks.find((chunk) => chunk.index === 2)?.attempts, 1);
  assert.equal(failedStateBeforeResume.chunks.find((chunk) => chunk.index === 3)?.attempts, 1);

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
    transcriber: new ControlledTranscriber({}),
    logger,
  });

  assert.equal(resumedRun.exitCode, 0);

  const stateAfterResume = JSON.parse(await readFile(join(outputDir, "job-state.json"), "utf8")) as {
    status: string;
    chunks: Array<{ index: number; attempts: number }>;
  };

  assert.equal(stateAfterResume.status, "succeeded");
  assert.equal(stateAfterResume.chunks.find((chunk) => chunk.index === 1)?.attempts, 1);
  assert.equal(stateAfterResume.chunks.find((chunk) => chunk.index === 2)?.attempts, 2);
  assert.equal(stateAfterResume.chunks.find((chunk) => chunk.index === 3)?.attempts, 1);
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
    transcriber: new ControlledTranscriber({}),
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
