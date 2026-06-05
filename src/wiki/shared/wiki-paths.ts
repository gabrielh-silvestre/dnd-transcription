import { join, relative, resolve } from "node:path";

export const DEFAULT_CODE_WIKI_ROOT = "docs/wiki";

export interface CodeWikiPaths {
  rootDir: string;
  evidenceDir: string;
  evidenceModulesDir: string;
  evidenceWorkflowsDir: string;
  pagesDir: string;
  reportsDir: string;
  indexPath: string;
  evidenceIndexPath: string;
  refinedIndexPath: string;
  logPath: string;
  lintReportPath: string;
}

export function toPosixPath(value: string): string {
  return value.replace(/\\/gu, "/");
}

export function resolveCodeWikiPaths(repoRoot: string, wikiRoot = DEFAULT_CODE_WIKI_ROOT): CodeWikiPaths {
  const rootDir = resolve(repoRoot, wikiRoot);

  return {
    rootDir,
    evidenceDir: join(rootDir, "evidence"),
    evidenceModulesDir: join(rootDir, "evidence", "modules"),
    evidenceWorkflowsDir: join(rootDir, "evidence", "workflows"),
    pagesDir: join(rootDir, "pages"),
    reportsDir: join(rootDir, "reports"),
    indexPath: join(rootDir, "index.md"),
    evidenceIndexPath: join(rootDir, "evidence", "index.md"),
    refinedIndexPath: join(rootDir, "pages", "index.md"),
    logPath: join(rootDir, "log.md"),
    lintReportPath: join(rootDir, "reports", "wiki-lint-report.md"),
  };
}

export function relativeToWikiRoot(paths: CodeWikiPaths, absolutePath: string): string {
  return toPosixPath(relative(paths.rootDir, absolutePath));
}

export function relativeToRepoRoot(repoRoot: string, absolutePath: string): string {
  return toPosixPath(relative(repoRoot, absolutePath));
}
