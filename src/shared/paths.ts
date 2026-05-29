import { createHash } from "node:crypto";
import { basename, extname, join, relative, resolve, sep } from "node:path";

export type CleanupPolicy = "on-success" | "keep";

export interface JobPaths {
  rootDir: string;
  manifestPath: string;
  jobStatePath: string;
  chunksDir: string;
  transcriptsDir: string;
  finalTranscriptPath: string;
}

export const MANIFEST_FILE_NAME = "manifest.json";
export const JOB_STATE_FILE_NAME = "job-state.json";
export const FINAL_TRANSCRIPT_FILE_NAME = "transcript.md";

export function resolveJobPaths(outputDir: string): JobPaths {
  const rootDir = resolve(outputDir);

  return {
    rootDir,
    manifestPath: join(rootDir, MANIFEST_FILE_NAME),
    jobStatePath: join(rootDir, JOB_STATE_FILE_NAME),
    chunksDir: join(rootDir, "chunks"),
    transcriptsDir: join(rootDir, "transcripts"),
    finalTranscriptPath: join(rootDir, FINAL_TRANSCRIPT_FILE_NAME),
  };
}

export function formatChunkIndex(index: number): string {
  return index.toString().padStart(4, "0");
}

export function formatChunkAudioFileName(index: number): string {
  return `${formatChunkIndex(index)}.wav`;
}

export function formatChunkMarkdownFileName(index: number): string {
  return `${formatChunkIndex(index)}.md`;
}

export function normalizeRelativePath(rootDir: string, targetPath: string): string {
  return relative(rootDir, targetPath).split(sep).join("/");
}

export function resolveFromRoot(rootDir: string, relativePath: string): string {
  return resolve(rootDir, relativePath);
}

export function deriveJobSubdir(resolvedAbsolutePath: string): string {
  const hash = createHash("sha256").update(resolvedAbsolutePath).digest("hex").slice(0, 8);
  const name = basename(resolvedAbsolutePath, extname(resolvedAbsolutePath));
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "input";
  return `${slug}-${hash}`;
}
