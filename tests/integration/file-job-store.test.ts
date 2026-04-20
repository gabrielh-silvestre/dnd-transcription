import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

import { createChunkManifest } from "../../src/domain/entities/chunk-manifest.js";
import { createTranscriberSignature } from "../../src/domain/ports/transcriber.js";
import { type ChunkManifestRecord } from "../../src/infrastructure/storage/chunk-manifest-record.js";
import { toChunkManifestRecord, toJobStateRecord } from "../../src/infrastructure/storage/job-persistence-mapper.js";
import { type JobStateRecord } from "../../src/infrastructure/storage/job-state-record.js";
import { FileJobStore } from "../../src/infrastructure/storage/file-job-store.js";
import { resolveJobPaths } from "../../src/shared/paths.js";
import { createTempDir } from "../helpers/temp-dir.js";

async function createInputFixture(root: string): Promise<string> {
  const inputPath = join(root, "input.mkv");
  await writeFile(inputPath, "fixture", "utf8");
  return inputPath;
}

describe("File job store", () => {
  it("preserva manifest/job-state e reconcilia resume sem drift", async () => {
    const root = await createTempDir("file-job-store-round-trip");
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
    const rawManifest = JSON.parse(await readFile(join(outputDir, "manifest.json"), "utf8")) as ChunkManifestRecord;
    const rawState = JSON.parse(await readFile(join(outputDir, "job-state.json"), "utf8")) as JobStateRecord;

    expect(manifestFromDisk.toState()).toStrictEqual(manifest.toState());
    expect(rawManifest).toStrictEqual(manifest.toState());
    expect(rawManifest).toStrictEqual(toChunkManifestRecord(outputDir, manifestFromDisk));
    expect(stateFromDisk.status).toBe("partial_failed");
    expect(rawState.status).toBe("partial_failed");
    expect(rawState.manifestPath).toBe("manifest.json");
    expect(rawState.finalMarkdownPath).toBeNull();
    expect(rawState.errorSummary).toBe("Uma ou mais transcricoes falharam; o job pode ser retomado com --resume.");
    expect(rawState.compatibility).toStrictEqual(compatibility);
    expect(
      rawState.chunks.map((chunk) => ({
        index: chunk.index,
        status: chunk.status,
        attempts: chunk.attempts,
        errorSummary: chunk.errorSummary,
        markdownPath: chunk.markdownPath,
      })),
    ).toStrictEqual([
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
    ]);
    expect(rawState).toStrictEqual(toJobStateRecord(outputDir, stateFromDisk));

    const reconciledState = await reloadedStore.reconcileForResume();
    const rawStateAfterReconcile = JSON.parse(await readFile(join(outputDir, "job-state.json"), "utf8")) as JobStateRecord;

    expect(reconciledState.status).toBe("partial_failed");
    expect(reconciledState.chunks[0]?.status).toBe("succeeded");
    expect(reconciledState.chunks[1]?.status).toBe("pending");
    expect(reconciledState.chunks[1]?.attempts).toBe(1);
    expect(reconciledState.chunks[1]?.errorSummary).toBe("falha sintetica");
    expect(reconciledState.chunks[1]?.startedAt).toBeNull();
    expect(reconciledState.chunks[1]?.finishedAt).toBeNull();
    expect(rawStateAfterReconcile.status).toBe("partial_failed");
    expect(rawStateAfterReconcile.manifestPath).toBe("manifest.json");
    expect(rawStateAfterReconcile.finalMarkdownPath).toBeNull();
    expect(rawStateAfterReconcile.errorSummary).toBe("Uma ou mais transcricoes falharam; o job pode ser retomado com --resume.");
    expect(rawStateAfterReconcile.compatibility).toStrictEqual(compatibility);
    expect(
      rawStateAfterReconcile.chunks.map((chunk) => ({
        index: chunk.index,
        status: chunk.status,
        attempts: chunk.attempts,
        errorSummary: chunk.errorSummary,
        markdownPath: chunk.markdownPath,
        startedAt: chunk.startedAt,
        finishedAt: chunk.finishedAt,
      })),
    ).toStrictEqual([
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
    ]);
    expect(rawStateAfterReconcile).toStrictEqual(toJobStateRecord(outputDir, reconciledState));
    expect(rawStateAfterReconcile.chunks[0]?.startedAt).not.toBeNull();
    expect(rawStateAfterReconcile.chunks[0]?.finishedAt).not.toBeNull();
    expect((await reloadedStore.readManifest()).toState()).toStrictEqual(manifest.toState());
    expect((await reloadedStore.readJobState()).compatibility).toStrictEqual(compatibility);
  });
});
