import { describe, expect, it } from "@jest/globals";

import { ChunkManifest, createChunkManifest } from "../../src/domain/entities/chunk-manifest.js";

describe("Chunk manifest", () => {
  it("ordena chunks e preserva janelas em ms", () => {
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

    expect(manifest).toBeInstanceOf(ChunkManifest);
    expect(manifest.chunks.map((chunk) => chunk.index)).toStrictEqual([1, 2]);
    expect(manifest.chunks[1]?.endMs).toBe(120_000);
    expect(manifest.toState().chunks.map((chunk) => chunk.chunkPath)).toStrictEqual([
      "chunks/0001.wav",
      "chunks/0002.wav",
    ]);
  });

  it("rejeita manifesto sobreposto", () => {
    expect(() => {
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
    }).toThrow(/nao e monotono/);
  });

  it("restaura estado serializado sem perder compatibilidade", () => {
    const manifest = ChunkManifest.restore({
      version: 1,
      createdAt: "2026-01-02T03:04:05.000Z",
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
          startMs: 60_000,
          endMs: 120_000,
          chunkPath: "chunks/0002.wav",
        },
      ],
    });

    expect(manifest.toState()).toStrictEqual({
      version: 1,
      createdAt: "2026-01-02T03:04:05.000Z",
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
          startMs: 60_000,
          endMs: 120_000,
          chunkPath: "chunks/0002.wav",
        },
      ],
    });
  });
});
