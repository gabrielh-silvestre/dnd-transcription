import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { CodeWikiService } from "../../../src/wiki/application/code-wiki-service.js";
import { createTempDir } from "../../helpers/temp-dir.js";

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

test("CodeWikiService init cria evidence, playbook de refinamento e scaffold de paginas refinadas", async (context) => {
  const root = await createTempDir("code-wiki-init", context);
  await createRepoFixture(root);
  const service = new CodeWikiService({
    cwd: root,
    now: () => new Date("2026-04-20T12:00:00.000Z"),
  });

  const result = await service.init();

  assert.equal(result.wikiRoot, "docs/wiki");
  assert.deepEqual(result.updatedPages.includes("evidence/overview.md"), true);
  assert.deepEqual(result.updatedPages.includes("pages/index.md"), true);

  const index = await readFile(join(root, "docs", "wiki", "index.md"), "utf8");
  const log = await readFile(join(root, "docs", "wiki", "log.md"), "utf8");
  const overview = await readFile(join(root, "docs", "wiki", "evidence", "overview.md"), "utf8");
  const playbook = await readFile(join(root, "docs", "wiki", "refinement-playbook.md"), "utf8");

  assert.match(index, /\[Evidence Index\]\(\.\/evidence\/index\.md\)/);
  assert.match(index, /\[Refined Pages Index\]\(\.\/pages\/index\.md\)/);
  assert.match(log, /## \[2026-04-20\] init \| Code Wiki Bootstrap/);
  assert.match(overview, /deterministic evidence/i);
  assert.match(playbook, /Never edit `docs\/wiki\/evidence\/`/);
});

test("CodeWikiService ingest atualiza evidence afetada e appende no log", async (context) => {
  const root = await createTempDir("code-wiki-ingest", context);
  await createRepoFixture(root);
  const service = new CodeWikiService({
    cwd: root,
    now: () => new Date("2026-04-20T12:00:00.000Z"),
  });

  await service.init();
  const result = await service.ingest(["src/cli/main.ts"]);
  const log = await readFile(join(root, "docs", "wiki", "log.md"), "utf8");

  assert.equal(result.updatedPages.includes("evidence/modules/cli.md"), true);
  assert.equal(result.updatedPages.includes("index.md"), true);
  assert.equal(result.updatedPages.includes("evidence/index.md"), true);
  assert.match(log, /## \[2026-04-20\] ingest \| src\/cli\/main\.ts/);
});

test("CodeWikiService query encontra paginas refinadas e evidence no mesmo vault", async (context) => {
  const root = await createTempDir("code-wiki-query", context);
  await createRepoFixture(root);
  const service = new CodeWikiService({
    cwd: root,
    now: () => new Date("2026-04-20T12:00:00.000Z"),
  });

  await service.init();
  await writeFile(
    join(root, "docs", "wiki", "pages", "resume-guide.md"),
    [
      "---",
      'title: "Resume Guide"',
      'summary: "Refined explanation of resume semantics."',
      "---",
      "",
      "# Resume Guide",
      "",
      "## What It Covers",
      "",
      "This refined page explains resume semantics and compatibility snapshot behavior.",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "docs", "wiki", "pages", "index.md"),
    [
      "# Refined Pages Index",
      "",
      "## Workflows",
      "",
      "- [Resume Guide](./resume-guide.md): refined explanation of resume semantics.",
      "",
    ].join("\n"),
    "utf8",
  );

  const matches = await service.query("resume semantics compatibility snapshot", "docs/wiki", 5);

  assert.equal(matches.length > 0, true);
  assert.equal(matches.some((match) => match.path === "pages/resume-guide.md"), true);
  assert.equal(matches.some((match) => match.path === "evidence/workflows/resume-semantics.md"), true);
});

test("CodeWikiService refresh nao sobrescreve o indice refinado quando ele ja existe", async (context) => {
  const root = await createTempDir("code-wiki-refined-index", context);
  await createRepoFixture(root);
  const service = new CodeWikiService({
    cwd: root,
    now: () => new Date("2026-04-20T12:00:00.000Z"),
  });

  await service.init();
  const customRefinedIndex = [
    "# Refined Pages Index",
    "",
    "## Foundations",
    "",
    "- [My Refined Page](./my-refined-page.md): custom curated page.",
    "",
  ].join("\n");
  await writeFile(join(root, "docs", "wiki", "pages", "index.md"), customRefinedIndex, "utf8");

  const result = await service.refresh();
  const refinedIndex = await readFile(join(root, "docs", "wiki", "pages", "index.md"), "utf8");

  assert.equal(result.updatedPages.includes("pages/index.md"), false);
  assert.equal(refinedIndex, customRefinedIndex);
});

test("CodeWikiService lint detecta pagina nao indexada, orfa e com link quebrado", async (context) => {
  const root = await createTempDir("code-wiki-lint", context);
  await createRepoFixture(root);
  const service = new CodeWikiService({
    cwd: root,
    now: () => new Date("2026-04-20T12:00:00.000Z"),
  });

  await service.init();
  await writeFile(
    join(root, "docs", "wiki", "custom.md"),
    "# Custom\n\nVeja [missing](./missing.md).\n",
    "utf8",
  );

  const result = await service.lint();
  const report = await readFile(join(root, result.reportPath), "utf8");

  assert.deepEqual(result.unindexedPages.includes("custom.md"), true);
  assert.deepEqual(result.orphanPages.includes("custom.md"), true);
  assert.deepEqual(result.brokenLinks.includes("custom.md -> ./missing.md"), true);
  assert.match(report, /status: FAIL/);
});
