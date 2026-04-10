import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCompatibleSnapshot,
  computeExitCode,
  createInitialJobState,
  createPendingChunks,
  transitionChunkStatus,
  transitionJobStatus,
} from "../../src/domain/entities/job-state.js";
import { createChunkManifest } from "../../src/domain/entities/chunk-manifest.js";

test("maquina de estados do job respeita transicoes autoritativas", () => {
  const state = createInitialJobState({
    jobId: "job-1",
    provider: "fake",
    cleanupPolicy: "keep",
    compatibility: {
      resolvedInputPath: "/tmp/input.mkv",
      inputSizeBytes: 10,
      inputMtimeMs: 20,
      provider: "fake",
      chunkDurationSeconds: 60,
    },
  });

  transitionJobStatus(state, "segmenting");
  transitionJobStatus(state, "ready");
  transitionJobStatus(state, "running");
  transitionJobStatus(state, "partial_failed");

  assert.equal(state.status, "partial_failed");
  assert.equal(computeExitCode(state), 2);
  assert.throws(() => transitionJobStatus(state, "succeeded"), /Transicao de job invalida/);
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
  const chunks = createPendingChunks(manifest);

  transitionChunkStatus(chunks[0]!, "running");
  transitionChunkStatus(chunks[0]!, "succeeded");
  transitionChunkStatus(chunks[1]!, "running");
  transitionChunkStatus(chunks[1]!, "failed");
  transitionChunkStatus(chunks[1]!, "pending");

  assert.equal(chunks[0]?.status, "succeeded");
  assert.equal(chunks[1]?.status, "pending");
});

test("resume rejeita snapshot incompativel", () => {
  assert.throws(() => {
    assertCompatibleSnapshot(
      {
        resolvedInputPath: "/tmp/input-a.mkv",
        inputSizeBytes: 10,
        inputMtimeMs: 20,
        provider: "fake",
        chunkDurationSeconds: 600,
      },
      {
        resolvedInputPath: "/tmp/input-a.mkv",
        inputSizeBytes: 10,
        inputMtimeMs: 20,
        provider: "other",
        chunkDurationSeconds: 600,
      },
    );
  }, /provider/);
});
