import assert from "node:assert/strict";
import test from "node:test";

import { type ChunkManifestRecord } from "../../src/infrastructure/storage/chunk-manifest-record.js";
import {
  fromChunkManifestRecord,
  fromJobStateRecord,
  toChunkManifestRecord,
  toJobStateRecord,
} from "../../src/infrastructure/storage/job-persistence-mapper.js";
import { type JobStateRecord } from "../../src/infrastructure/storage/job-state-record.js";

const rootDir = "/tmp/job-root";

test("mapper de manifest normaliza ordenacao, timestamp e caminhos relativos", () => {
  const record: ChunkManifestRecord = {
    version: 1,
    createdAt: "2026-01-02T03:04:05Z",
    inputPath: "/tmp/input.mkv",
    chunkDurationMs: 60_000,
    totalDurationMs: 120_000,
    chunks: [
      {
        index: 2,
        startMs: 60_000,
        endMs: 120_000,
        chunkPath: "./chunks/0002.wav",
      },
      {
        index: 1,
        startMs: 0,
        endMs: 60_000,
        chunkPath: "chunks\\0001.wav",
      },
    ],
  };

  const manifest = fromChunkManifestRecord(rootDir, record);
  const remappedRecord = toChunkManifestRecord(rootDir, manifest);

  assert.equal(manifest.createdAt, "2026-01-02T03:04:05.000Z");
  assert.deepEqual(
    manifest.chunks.map((chunk) => ({
      index: chunk.index,
      chunkPath: chunk.chunkPath,
    })),
    [
      { index: 1, chunkPath: "chunks/0001.wav" },
      { index: 2, chunkPath: "chunks/0002.wav" },
    ],
  );
  assert.deepEqual(remappedRecord, {
    ...record,
    createdAt: "2026-01-02T03:04:05.000Z",
    chunks: [
      {
        index: 1,
        startMs: 0,
        endMs: 60_000,
        chunkPath: "chunks/0001.wav",
      },
      {
        index: 2,
        startMs: 60_000,
        endMs: 120_000,
        chunkPath: "chunks/0002.wav",
      },
    ],
  });
});

test("mapper de job-state preserva schema persistido e normaliza listas/timestamps", () => {
  const record: JobStateRecord = {
    version: 1,
    jobId: "job-1",
    createdAt: "2026-01-02T03:04:05Z",
    updatedAt: "2026-01-02T03:05:06Z",
    provider: "fake",
    cleanupPolicy: "keep",
    status: "partial_failed",
    errorSummary: "falha sintetica",
    manifestPath: "./manifest.json",
    finalMarkdownPath: null,
    compatibility: {
      resolvedInputPath: "/tmp/input.mkv",
      inputSizeBytes: 10,
      inputMtimeMs: 20,
      provider: "fake",
      transcriberSignature: "{\"provider\":\"fake\"}",
      chunkDurationSeconds: 60,
    },
    chunks: [
      {
        index: 2,
        status: "failed",
        attempts: 2,
        errorSummary: "falha sintetica",
        markdownPath: null,
        startedAt: null,
        finishedAt: "2026-01-02T03:06:07Z",
      },
      {
        index: 1,
        status: "succeeded",
        attempts: 1,
        errorSummary: null,
        markdownPath: "transcripts\\0001.md",
        startedAt: "2026-01-02T03:04:07Z",
        finishedAt: "2026-01-02T03:04:08Z",
      },
    ],
  };

  const state = fromJobStateRecord(rootDir, record);
  const remappedRecord = toJobStateRecord(rootDir, state);

  assert.equal(state.createdAt, "2026-01-02T03:04:05.000Z");
  assert.equal(state.updatedAt, "2026-01-02T03:05:06.000Z");
  assert.equal(state.manifestPath, "manifest.json");
  assert.deepEqual(
    state.chunks.map((chunk) => ({
      index: chunk.index,
      markdownPath: chunk.markdownPath,
      startedAt: chunk.startedAt,
      finishedAt: chunk.finishedAt,
    })),
    [
      {
        index: 1,
        markdownPath: "transcripts/0001.md",
        startedAt: "2026-01-02T03:04:07.000Z",
        finishedAt: "2026-01-02T03:04:08.000Z",
      },
      {
        index: 2,
        markdownPath: null,
        startedAt: null,
        finishedAt: "2026-01-02T03:06:07.000Z",
      },
    ],
  );
  assert.deepEqual(remappedRecord, {
    ...record,
    createdAt: "2026-01-02T03:04:05.000Z",
    updatedAt: "2026-01-02T03:05:06.000Z",
    manifestPath: "manifest.json",
    chunks: [
      {
        index: 1,
        status: "succeeded",
        attempts: 1,
        errorSummary: null,
        markdownPath: "transcripts/0001.md",
        startedAt: "2026-01-02T03:04:07.000Z",
        finishedAt: "2026-01-02T03:04:08.000Z",
      },
      {
        index: 2,
        status: "failed",
        attempts: 2,
        errorSummary: "falha sintetica",
        markdownPath: null,
        startedAt: null,
        finishedAt: "2026-01-02T03:06:07.000Z",
      },
    ],
  });
});
