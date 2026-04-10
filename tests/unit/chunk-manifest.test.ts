import assert from "node:assert/strict";
import test from "node:test";

import { createChunkManifest } from "../../src/domain/entities/chunk-manifest.js";

test("createChunkManifest ordena chunks e preserva janelas em ms", () => {
  const manifest = createChunkManifest({
    inputPath: "/tmp/input.mkv",
    chunkDurationMs: 60_000,
    totalDurationMs: 120_000,
    chunks: [
      {
        index: 2,
        startMs: 60_000,
        endMs: 120_000,
        chunkPath: "chunks/0002.wav",
      },
      {
        index: 1,
        startMs: 0,
        endMs: 60_000,
        chunkPath: "chunks/0001.wav",
      },
    ],
  });

  assert.deepEqual(
    manifest.chunks.map((chunk) => chunk.index),
    [1, 2],
  );
  assert.equal(manifest.chunks[1]?.endMs, 120_000);
});

test("createChunkManifest rejeita manifesto sobreposto", () => {
  assert.throws(() => {
    createChunkManifest({
      inputPath: "/tmp/input.mkv",
      chunkDurationMs: 60_000,
      totalDurationMs: 120_000,
      chunks: [
        {
          index: 1,
          startMs: 0,
          endMs: 60_000,
          chunkPath: "chunks/0001.wav",
        },
        {
          index: 2,
          startMs: 59_000,
          endMs: 120_000,
          chunkPath: "chunks/0002.wav",
        },
      ],
    });
  }, /nao e monotono/);
});
