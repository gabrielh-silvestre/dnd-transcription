import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { describe, expect, it } from "@jest/globals";

import { CodeWikiService } from "../../../src/wiki/application/code-wiki-service.js";
import { createTempDir } from "../../helpers/temp-dir.js";

/**
 * Frozen-input characterization (golden) test for the code-wiki renderers.
 *
 * Role (see .omc/plans/code-simplification-refactor.md, Phase 0b): this test
 * isolates the question "did the rendering LOGIC change against a frozen
 * input?". It does NOT protect the committed docs/wiki/evidence bytes of the
 * real repository — that is the job of the live `npm run wiki -- refresh`
 * clean-tree diff. Because the input tree is fixed (createRepoFixture) and the
 * clock is injected, every rendered file except log.md is byte-deterministic.
 *
 * Expected fixtures live OUTSIDE tests/ (repo-root test-fixtures/wiki-golden/**)
 * so they are not walked by collectCodeWikiRepoSnapshot and do not inflate the
 * evidence test-file inventory.
 *
 * To (re)capture fixtures with the current rendering code:
 *   UPDATE_WIKI_GOLDEN=1 npm test -- --testPathPatterns=code-wiki-golden
 * Capture must only ever be run against unmodified rendering logic; otherwise
 * the assertion becomes tautological.
 */

const FIXED_NOW = "2026-04-20T12:00:00.000Z";
const GOLDEN_DIR = join(process.cwd(), "test-fixtures", "wiki-golden");
const UPDATE = process.env.UPDATE_WIKI_GOLDEN === "1";

// log.md receives a dated append on every wiki mutation; assert its shape, not
// its bytes, mirroring code-wiki-service.test.ts.
const LOG_RELATIVE_PATH = "log.md";

async function createRepoFixture(root: string): Promise<void> {
  await Promise.all([
    mkdir(join(root, "src", "cli"), { recursive: true }),
    mkdir(join(root, "src", "application"), { recursive: true }),
    mkdir(join(root, "src", "domain", "entities"), { recursive: true }),
    mkdir(join(root, "src", "infrastructure", "providers"), { recursive: true }),
    mkdir(join(root, "src", "infrastructure", "storage"), { recursive: true }),
    mkdir(join(root, "tests", "unit"), { recursive: true }),
    mkdir(join(root, ".omx", "plans"), { recursive: true }),
    mkdir(join(root, ".claude", "project-context"), { recursive: true }),
  ]);

  await Promise.all([
    writeFile(join(root, "README.md"), "# fixture\n", "utf8"),
    writeFile(join(root, "package.json"), "{\n  \"name\": \"fixture\"\n}\n", "utf8"),
    writeFile(join(root, "src", "cli", "main.ts"), "export const cli = true;\n", "utf8"),
    writeFile(join(root, "src", "application", "run-transcription-job-use-case.ts"), "export const app = true;\n", "utf8"),
    writeFile(join(root, "src", "domain", "entities", "job.ts"), "export const job = true;\n", "utf8"),
    writeFile(join(root, "src", "infrastructure", "storage", "file-job-store.ts"), "export const store = true;\n", "utf8"),
    writeFile(join(root, "src", "infrastructure", "providers", "fake-transcriber.ts"), "export const fake = true;\n", "utf8"),
    writeFile(join(root, "tests", "unit", "fixture.test.ts"), "export const testFile = true;\n", "utf8"),
    writeFile(join(root, ".omx", "plans", "brownfield-map.md"), "# plan\n", "utf8"),
    writeFile(join(root, ".claude", "project-context", "current-state.md"), "# state\n", "utf8"),
  ]);
}

async function listFilesRecursive(root: string): Promise<string[]> {
  const collected: string[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else {
        collected.push(relative(root, absolute).split(sep).join("/"));
      }
    }
  }

  await walk(root);

  return collected.sort();
}

describe("Code wiki golden characterization", () => {
  it("renders byte-identical output for a frozen fixture repo", async () => {
    const root = await createTempDir("code-wiki-golden");
    await createRepoFixture(root);

    const service = new CodeWikiService({
      cwd: root,
      now: () => new Date(FIXED_NOW),
    });

    await service.init();

    const wikiRoot = join(root, "docs", "wiki");
    const renderedFiles = await listFilesRecursive(wikiRoot);

    expect(renderedFiles.length).toBeGreaterThan(0);

    if (UPDATE) {
      for (const relativePath of renderedFiles) {
        const content = await readFile(join(wikiRoot, relativePath), "utf8");
        const goldenPath = join(GOLDEN_DIR, relativePath);
        await mkdir(dirname(goldenPath), { recursive: true });
        await writeFile(goldenPath, content, "utf8");
      }
      return;
    }

    const goldenFiles = await listFilesRecursive(GOLDEN_DIR);
    expect(renderedFiles).toEqual(goldenFiles);

    for (const relativePath of renderedFiles) {
      const actual = await readFile(join(wikiRoot, relativePath), "utf8");

      if (relativePath === LOG_RELATIVE_PATH) {
        expect(actual).toMatch(/## \[2026-04-20\] init \| Code Wiki Bootstrap/);
        continue;
      }

      const expected = await readFile(join(GOLDEN_DIR, relativePath), "utf8");
      // Embed the path so a mismatch identifies the offending file in the diff.
      expect(`=== ${relativePath} ===\n${actual}`).toBe(`=== ${relativePath} ===\n${expected}`);
    }
  });
});
