import assert from "node:assert/strict";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { FFmpegMediaSegmenter } from "../../src/infrastructure/media/ffmpeg-media-segmenter.js";
import { createTempDir } from "../helpers/temp-dir.js";

async function createExecutable(path: string, content: string): Promise<void> {
  await writeFile(path, content, { encoding: "utf8", mode: 0o755 });
}

test("FFmpegMediaSegmenter suporta input sintetico acima de 3 horas", async (context) => {
  const root = await createTempDir("segmenter-long", context);
  const binDir = join(root, "bin");
  const jobRoot = join(root, "job");

  await mkdir(binDir, { recursive: true });
  await mkdir(jobRoot, { recursive: true });

  await createExecutable(
    join(binDir, "ffprobe"),
    "#!/usr/bin/env bash\nprintf '%s' '{\"format\":{\"duration\":\"11160\"}}'\n",
  );
  await createExecutable(
    join(binDir, "ffmpeg"),
    "#!/usr/bin/env bash\nout=\"${@: -1}\"\nmkdir -p \"$(dirname \"$out\")\"\nprintf 'chunk' > \"$out\"\n",
  );

  const inputPath = join(root, "input.mkv");
  await writeFile(inputPath, "fixture", "utf8");

  const segmenter = new FFmpegMediaSegmenter({
    ffmpegPath: join(binDir, "ffmpeg"),
    ffprobePath: join(binDir, "ffprobe"),
  });
  const result = await segmenter.segment({
    inputPath,
    jobRootDir: jobRoot,
    workingDir: join(jobRoot, "chunks"),
    chunkDurationMs: 600_000,
  });

  assert.equal(result.manifest.chunks.length, 19);
  assert.equal(result.manifest.chunks[18]?.startMs, 10_800_000);
  assert.equal(result.manifest.chunks[18]?.endMs, 11_160_000);
  assert.equal(result.manifest.chunks[18]?.chunkPath, "chunks/0019.wav");

  await stat(join(jobRoot, result.manifest.chunks[0]!.chunkPath));
  await stat(join(jobRoot, result.manifest.chunks[18]!.chunkPath));
});
