import { join, relative, resolve } from "node:path";

import { walkFiles } from "../shared/walk-files.js";
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
  return await walkFiles(currentDir, {
    map: (absolutePath) => toPosixPath(relative(root, absolutePath)),
  });
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
