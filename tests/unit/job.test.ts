import assert from "node:assert/strict";
import test from "node:test";

import { Job } from "../../src/domain/entities/job.js";
import { JobChunk } from "../../src/domain/entities/job-chunk.js";
import { createChunkManifest } from "../../src/domain/entities/chunk-manifest.js";

test("maquina de estados do job respeita transicoes autoritativas", () => {
  const job = Job.createInitial({
    jobId: "job-1",
    provider: "fake",
    cleanupPolicy: "keep",
    compatibility: {
      resolvedInputPath: "/tmp/input.mkv",
      inputSizeBytes: 10,
      inputMtimeMs: 20,
      provider: "fake",
      transcriberSignature: "{\"provider\":\"fake\"}",
      chunkDurationSeconds: 60,
    },
  });

  job.updateStatus("segmenting");
  job.updateStatus("ready");
  job.updateStatus("running");
  job.updateStatus("partial_failed");

  assert.equal(job.status, "partial_failed");
  assert.equal(job.exitCode, 2);
  assert.throws(() => job.updateStatus("succeeded"), /Transicao de job invalida/);
});

test("chunks usam pending/running/succeeded/failed com recuperacao explicita", () => {
  const manifest = createChunkManifest({
    inputPath: "/tmp/input.mkv",
    chunkDurationMs: 60_000,
    totalDurationMs: 120_000,
    chunks: [
      { index: 1, startMs: 0, endMs: 60_000, chunkPath: "chunks/0001.wav" },
      { index: 2, startMs: 60_000, endMs: 120_000, chunkPath: "chunks/0002.wav" },
    ],
  });
  const chunks = Job.createPendingChunks(manifest);

  chunks[0]!.markRunning();
  chunks[0]!.markSucceeded("transcripts/0001.md");
  chunks[1]!.markRunning();
  chunks[1]!.markFailed("falha sintetica");
  chunks[1]!.returnToPending();

  assert.equal(chunks[0]?.status, "succeeded");
  assert.equal(chunks[1]?.status, "pending");
});

test("Job e JobChunk encapsulam transicoes e reconcile de resume", () => {
  const manifest = createChunkManifest({
    inputPath: "/tmp/input.mkv",
    chunkDurationMs: 60_000,
    totalDurationMs: 120_000,
    chunks: [
      { index: 1, startMs: 0, endMs: 60_000, chunkPath: "chunks/0001.wav" },
      { index: 2, startMs: 60_000, endMs: 120_000, chunkPath: "chunks/0002.wav" },
    ],
  });
  const job = Job.createInitial({
    jobId: "job-aggregate",
    provider: "fake",
    cleanupPolicy: "keep",
    compatibility: {
      resolvedInputPath: "/tmp/input.mkv",
      inputSizeBytes: 10,
      inputMtimeMs: 20,
      provider: "fake",
      transcriberSignature: "{\"provider\":\"fake\"}",
      chunkDurationSeconds: 60,
    },
  });

  job.updateStatus("segmenting");
  job.hydrateFromManifest(manifest, "manifest.json");
  job.updateStatus("ready");
  job.updateStatus("running");
  job.markChunkRunning(1, "2026-01-01T00:00:00.000Z");
  job.markChunkSucceeded(1, "transcripts/0001.md", "2026-01-01T00:00:01.000Z");
  job.markChunkRunning(2, "2026-01-01T00:01:00.000Z");
  job.markChunkFailed(2, "falha sintetica", "2026-01-01T00:01:01.000Z");
  job.updateStatus("partial_failed", {
    errorSummary: "Uma ou mais transcricoes falharam; o job pode ser retomado com --resume.",
  });

  assert.equal(job.getFailedChunks().map((chunk) => chunk.index).join(","), "2");
  assert.equal(job.exitCode, 2);

  job.reconcileForResume();

  assert.equal(job.getPendingChunks().map((chunk) => chunk.index).join(","), "2");
  assert.equal(job.getChunk(2).errorSummary, "falha sintetica");
  assert.equal(job.getChunk(2).startedAt, null);
  assert.equal(job.getChunk(2).finishedAt, null);
});

test("JobChunk valida ciclo de vida autoritativo", () => {
  const chunk = JobChunk.createPending(3);

  chunk.markRunning("2026-01-01T00:00:00.000Z");
  chunk.markFailed("falha sintetica", "2026-01-01T00:00:01.000Z");
  chunk.returnToPending();

  assert.deepEqual(chunk.toState(), {
    index: 3,
    status: "pending",
    attempts: 1,
    errorSummary: "falha sintetica",
    markdownPath: null,
    startedAt: null,
    finishedAt: null,
  });
});

test("resume rejeita snapshot incompativel", () => {
  assert.throws(() => {
    Job.assertCompatibleSnapshot(
      {
        resolvedInputPath: "/tmp/input-a.mkv",
        inputSizeBytes: 10,
        inputMtimeMs: 20,
        provider: "fake",
        transcriberSignature: "{\"provider\":\"fake\",\"prompt\":null}",
        chunkDurationSeconds: 600,
      },
      {
        resolvedInputPath: "/tmp/input-a.mkv",
        inputSizeBytes: 10,
        inputMtimeMs: 20,
        provider: "fake",
        transcriberSignature: "{\"provider\":\"fake\",\"prompt\":\"glossario\"}",
        chunkDurationSeconds: 600,
      },
    );
  }, /transcriberSignature/);
});
