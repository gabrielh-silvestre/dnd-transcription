import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCli } from "../src/cli/main.js";
import { ExternalCommandError } from "../src/shared/errors.js";
import { runCommand } from "../src/shared/process.js";

const LONG_DURATION_SECONDS = 11_160;
const CHUNK_DURATION_SECONDS = 600;

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "dnd-transcription-long-"));
  const inputPath = join(root, "long-input.mkv");
  const outputDir = join(root, "job");

  try {
    await runCommand([
      "ffmpeg",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=16000:cl=mono",
      "-t",
      String(LONG_DURATION_SECONDS),
      "-c:a",
      "aac",
      "-b:a",
      "16k",
      inputPath,
    ]);

    const exitCode = await runCli([
      "--input",
      inputPath,
      "--output",
      outputDir,
      "--chunk-duration-seconds",
      String(CHUNK_DURATION_SECONDS),
      "--concurrency",
      "4",
      "--provider",
      "fake",
      "--cleanup-policy",
      "keep",
    ]);

    assert.equal(exitCode, 0);

    const manifest = JSON.parse(await readFile(join(outputDir, "manifest.json"), "utf8")) as {
      chunks: Array<{ startMs: number; endMs: number }>;
    };
    const expectedChunkCount = Math.ceil(LONG_DURATION_SECONDS / CHUNK_DURATION_SECONDS);

    assert.equal(manifest.chunks.length, expectedChunkCount);
    assert.equal(manifest.chunks[expectedChunkCount - 1]?.endMs, LONG_DURATION_SECONDS * 1_000);

    process.stdout.write(`Long input verification succeeded with ${expectedChunkCount} chunks.\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof ExternalCommandError
    ? `${error.message}\n${error.stderr}`.trim()
    : error instanceof Error
      ? error.message
      : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
