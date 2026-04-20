import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { toPosixPath } from "../shared/wiki-paths.js";

export interface CodeWikiRepoSnapshot {
  repoRoot: string;
  generatedAt: string;
  srcFiles: string[];
  testFiles: string[];
  cliFiles: string[];
  applicationFiles: string[];
  domainFiles: string[];
  infrastructureFiles: string[];
  providerFiles: string[];
  planFiles: string[];
  contextFiles: string[];
}

async function listFilesRecursive(root: string, currentDir: string): Promise<string[]> {
  try {
    const entries = await readdir(currentDir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const absolutePath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        files.push(...await listFilesRecursive(root, absolutePath));
        continue;
      }

      if (entry.isFile()) {
        files.push(toPosixPath(relative(root, absolutePath)));
      }
    }

    return files.sort();
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;

    if (code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function filesUnder(files: readonly string[], prefix: string): string[] {
  return files.filter((file) => file.startsWith(`${prefix}/`));
}

export async function collectCodeWikiRepoSnapshot(repoRoot: string, generatedAt: string): Promise<CodeWikiRepoSnapshot> {
  const normalizedRepoRoot = resolve(repoRoot);
  const [srcFiles, testFiles, planFiles, contextFiles] = await Promise.all([
    listFilesRecursive(normalizedRepoRoot, join(normalizedRepoRoot, "src")),
    listFilesRecursive(normalizedRepoRoot, join(normalizedRepoRoot, "tests")),
    listFilesRecursive(normalizedRepoRoot, join(normalizedRepoRoot, ".omx", "plans")),
    listFilesRecursive(normalizedRepoRoot, join(normalizedRepoRoot, ".claude", "project-context")),
  ]);

  return {
    repoRoot: normalizedRepoRoot,
    generatedAt,
    srcFiles,
    testFiles,
    cliFiles: filesUnder(srcFiles, "src/cli"),
    applicationFiles: filesUnder(srcFiles, "src/application"),
    domainFiles: filesUnder(srcFiles, "src/domain"),
    infrastructureFiles: filesUnder(srcFiles, "src/infrastructure"),
    providerFiles: filesUnder(srcFiles, "src/infrastructure/providers"),
    planFiles,
    contextFiles,
  };
}
