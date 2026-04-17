import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { createChunkManifest } from "../../src/domain/entities/chunk-manifest.js";
import { createTranscriberSignature } from "../../src/domain/ports/transcriber.js";
import { FileJobStore } from "../../src/infrastructure/storage/file-job-store.js";
import { resolveJobPaths } from "../../src/shared/paths.js";
import { createTempDir } from "../helpers/temp-dir.js";

async function createInputFixture(root: string): Promise<string> {
  const inputPath = join(root, "input.mkv");
  await writeFile(inputPath, "fixture", "utf8");
  return inputPath;
}

test("FileJobStore preserva manifest/job-state no round-trip e reconcilia resume sem drift", async (context) => {
  const root = await createTempDir("file-job-store-round-trip", context);
  const outputDir = join(root, "job");
  const inputPath = await createInputFixture(root);
  const inputStats = await stat(inputPath);
  const store = new FileJobStore(resolveJobPaths(outputDir));
  const compatibility = {
    resolvedInputPath: inputPath,
    inputSizeBytes: inputStats.size,
    inputMtimeMs: inputStats.mtimeMs,
    provider: "fake",
    transcriberSignature: createTranscriberSignature({
      provider: "fake",
      variant: "round-trip",
    }),
    chunkDurationSeconds: 60,
  };
  const manifest = createChunkManifest({
    inputPath,
    chunkDurationMs: 60_000,
    totalDurationMs: 120_000,
    createdAt: "2026-01-02T03:05:00.000Z",
    chunks: [
      { index: 1, startMs: 0, endMs: 60_000, chunkPath: "chunks/0001.wav" },
      { index: 2, startMs: 60_000, endMs: 120_000, chunkPath: "chunks/0002.wav" },
    ],
  });

  await store.initializeJob({
    jobId: "job-round-trip",
    provider: "fake",
    cleanupPolicy: "keep",
    compatibility,
  });
  await store.updateJobStatus("segmenting");
  await store.writeManifest(manifest);
  await store.hydrateChunksFromManifest(manifest);
  await store.updateJobStatus("ready");
  await store.updateJobStatus("running");
  await store.markChunkRunning(1);
  const firstChunkMarkdownPath = await store.writeChunkMarkdown(1, "# Chunk 0001\n\nok\n");
  await store.markChunkSucceeded(1, firstChunkMarkdownPath);
  await store.markChunkRunning(2);
  await store.markChunkFailed(2, "falha sintetica");
  await store.updateJobStatus("partial_failed", {
    errorSummary: "Uma ou mais transcricoes falharam; o job pode ser retomado com --resume.",
  });

  const reloadedStore = new FileJobStore(resolveJobPaths(outputDir));
  const manifestFromDisk = await reloadedStore.readManifest();
  const stateFromDisk = await reloadedStore.readJobState();
  const rawManifest = JSON.parse(await readFile(join(outputDir, "manifest.json"), "utf8")) as typeof manifest;
  const rawState = JSON.parse(await readFile(join(outputDir, "job-state.json"), "utf8")) as {
    status: string;
    manifestPath: string | null;
    finalMarkdownPath: string | null;
    errorSummary: string | null;
    compatibility: typeof compatibility;
    chunks: Array<{
      index: number;
      status: string;
      attempts: number;
      errorSummary: string | null;
      markdownPath: string | null;
      startedAt: string | null;
      finishedAt: string | null;
    }>;
  };

  assert.deepEqual(manifestFromDisk, manifest);
  assert.deepEqual(rawManifest, manifest);
  assert.equal(stateFromDisk.status, "partial_failed");
  assert.equal(rawState.status, "partial_failed");
  assert.equal(rawState.manifestPath, "manifest.json");
  assert.equal(rawState.finalMarkdownPath, null);
  assert.equal(rawState.errorSummary, "Uma ou mais transcricoes falharam; o job pode ser retomado com --resume.");
  assert.deepEqual(rawState.compatibility, compatibility);
  assert.deepEqual(
    rawState.chunks.map((chunk) => ({
      index: chunk.index,
      status: chunk.status,
      attempts: chunk.attempts,
      errorSummary: chunk.errorSummary,
      markdownPath: chunk.markdownPath,
    })),
    [
      {
        index: 1,
        status: "succeeded",
        attempts: 1,
        errorSummary: null,
        markdownPath: "transcripts/0001.md",
      },
      {
        index: 2,
        status: "failed",
        attempts: 1,
        errorSummary: "falha sintetica",
        markdownPath: null,
      },
    ],
  );

  const reconciledState = await reloadedStore.reconcileForResume();
  const rawStateAfterReconcile = JSON.parse(await readFile(join(outputDir, "job-state.json"), "utf8")) as {
    status: string;
    manifestPath: string | null;
    finalMarkdownPath: string | null;
    errorSummary: string | null;
    compatibility: typeof compatibility;
    chunks: Array<{
      index: number;
      status: string;
      attempts: number;
      errorSummary: string | null;
      markdownPath: string | null;
      startedAt: string | null;
      finishedAt: string | null;
    }>;
  };

  assert.equal(reconciledState.status, "partial_failed");
  assert.equal(reconciledState.chunks[0]?.status, "succeeded");
  assert.equal(reconciledState.chunks[1]?.status, "pending");
  assert.equal(reconciledState.chunks[1]?.attempts, 1);
  assert.equal(reconciledState.chunks[1]?.errorSummary, "falha sintetica");
  assert.equal(reconciledState.chunks[1]?.startedAt, null);
  assert.equal(reconciledState.chunks[1]?.finishedAt, null);
  assert.equal(rawStateAfterReconcile.status, "partial_failed");
  assert.equal(rawStateAfterReconcile.manifestPath, "manifest.json");
  assert.equal(rawStateAfterReconcile.finalMarkdownPath, null);
  assert.equal(rawStateAfterReconcile.errorSummary, "Uma ou mais transcricoes falharam; o job pode ser retomado com --resume.");
  assert.deepEqual(rawStateAfterReconcile.compatibility, compatibility);
  assert.deepEqual(
    rawStateAfterReconcile.chunks.map((chunk) => ({
      index: chunk.index,
      status: chunk.status,
      attempts: chunk.attempts,
      errorSummary: chunk.errorSummary,
      markdownPath: chunk.markdownPath,
      startedAt: chunk.startedAt,
      finishedAt: chunk.finishedAt,
    })),
    [
      {
        index: 1,
        status: "succeeded",
        attempts: 1,
        errorSummary: null,
        markdownPath: "transcripts/0001.md",
        startedAt: rawStateAfterReconcile.chunks[0]?.startedAt ?? null,
        finishedAt: rawStateAfterReconcile.chunks[0]?.finishedAt ?? null,
      },
      {
        index: 2,
        status: "pending",
        attempts: 1,
        errorSummary: "falha sintetica",
        markdownPath: null,
        startedAt: null,
        finishedAt: null,
      },
    ],
  );
  assert.notEqual(rawStateAfterReconcile.chunks[0]?.startedAt, null);
  assert.notEqual(rawStateAfterReconcile.chunks[0]?.finishedAt, null);
  assert.deepEqual(await reloadedStore.readManifest(), manifest);
  assert.deepEqual((await reloadedStore.readJobState()).compatibility, compatibility);
});
