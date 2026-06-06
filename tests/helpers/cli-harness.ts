import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { FileJobStore } from "../../src/infrastructure/storage/file-job-store.js";
import { resolveJobPaths } from "../../src/shared/paths.js";
import { StubMediaSegmenter } from "./stub-media-segmenter.js";

export interface BuildCliArgsOptions {
  inputs: string[];
  outputDir: string;
  provider: string;
  chunkDurationSeconds?: number;
  concurrency?: number;
  fileConcurrency?: number;
  cleanupPolicy?: string;
  resume?: boolean;
}

export function buildCliArgs(options: BuildCliArgsOptions): string[] {
  const args: string[] = [];

  for (const input of options.inputs) {
    args.push("--input", input);
  }

  args.push(
    "--output",
    options.outputDir,
    "--chunk-duration-seconds",
    String(options.chunkDurationSeconds ?? 60),
    "--concurrency",
    String(options.concurrency ?? 2),
  );

  if (options.fileConcurrency !== undefined) {
    args.push("--file-concurrency", String(options.fileConcurrency));
  }

  args.push(
    "--provider",
    options.provider,
    "--cleanup-policy",
    options.cleanupPolicy ?? "keep",
  );

  if (options.resume === true) {
    args.push("--resume");
  }

  return args;
}

export function createFileJobStore(dir: string): FileJobStore {
  return new FileJobStore(resolveJobPaths(dir));
}

export function createThreeChunkSegmenter(): StubMediaSegmenter {
  return new StubMediaSegmenter({
    totalDurationMs: 180_000,
    chunks: [
      { index: 1, startMs: 0, endMs: 60_000 },
      { index: 2, startMs: 60_000, endMs: 120_000 },
      { index: 3, startMs: 120_000, endMs: 180_000 },
    ],
  });
}

export function extractChunkNumber(audioPath: string): number {
  const match = /(\d+)\.wav$/u.exec(audioPath);

  if (match === null) {
    throw new Error(`Nao foi possivel inferir chunk de ${audioPath}`);
  }

  return Number(match[1]);
}

export async function createInputFixture(root: string): Promise<string> {
  const inputPath = join(root, "input.mkv");
  await writeFile(inputPath, "fixture", "utf8");
  return inputPath;
}
