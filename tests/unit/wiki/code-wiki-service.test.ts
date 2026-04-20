import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

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

describe("Code wiki service", () => {
  it("cria evidence, playbook de refinamento e scaffold de paginas refinadas", async () => {
    const root = await createTempDir("code-wiki-init");
    await createRepoFixture(root);
    const service = new CodeWikiService({
      cwd: root,
      now: () => new Date("2026-04-20T12:00:00.000Z"),
    });

    const result = await service.init();

    expect(result.wikiRoot).toBe("docs/wiki");
    expect(result.updatedPages.includes("evidence/overview.md")).toBe(true);
    expect(result.updatedPages.includes("pages/index.md")).toBe(true);

    const index = await readFile(join(root, "docs", "wiki", "index.md"), "utf8");
    const log = await readFile(join(root, "docs", "wiki", "log.md"), "utf8");
    const overview = await readFile(join(root, "docs", "wiki", "evidence", "overview.md"), "utf8");
    const playbook = await readFile(join(root, "docs", "wiki", "refinement-playbook.md"), "utf8");

    expect(index).toMatch(/\[Evidence Index\]\(\.\/evidence\/index\.md\)/);
    expect(index).toMatch(/\[Refined Pages Index\]\(\.\/pages\/index\.md\)/);
    expect(log).toMatch(/## \[2026-04-20\] init \| Code Wiki Bootstrap/);
    expect(overview).toMatch(/deterministic evidence/i);
    expect(playbook).toMatch(/Never edit `docs\/wiki\/evidence\/`/);
  });

  it("atualiza evidence afetada e appende no log", async () => {
    const root = await createTempDir("code-wiki-ingest");
    await createRepoFixture(root);
    const service = new CodeWikiService({
      cwd: root,
      now: () => new Date("2026-04-20T12:00:00.000Z"),
    });

    await service.init();
    const result = await service.ingest(["src/cli/main.ts"]);
    const log = await readFile(join(root, "docs", "wiki", "log.md"), "utf8");

    expect(result.updatedPages.includes("evidence/modules/cli.md")).toBe(true);
    expect(result.updatedPages.includes("index.md")).toBe(true);
    expect(result.updatedPages.includes("evidence/index.md")).toBe(true);
    expect(log).toMatch(/## \[2026-04-20\] ingest \| src\/cli\/main\.ts/);
  });

  it("encontra paginas refinadas e evidence no mesmo vault", async () => {
    const root = await createTempDir("code-wiki-query");
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

    expect(matches.length > 0).toBe(true);
    expect(matches.some((match) => match.path === "pages/resume-guide.md")).toBe(true);
    expect(matches.some((match) => match.path === "evidence/workflows/resume-semantics.md")).toBe(true);
  });

  it("nao sobrescreve o indice refinado quando ele ja existe", async () => {
    const root = await createTempDir("code-wiki-refined-index");
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

    expect(result.updatedPages.includes("pages/index.md")).toBe(false);
    expect(refinedIndex).toBe(customRefinedIndex);
  });

  it("detecta pagina nao indexada, orfa e com link quebrado", async () => {
    const root = await createTempDir("code-wiki-lint");
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

    expect(result.unindexedPages.includes("custom.md")).toBe(true);
    expect(result.orphanPages.includes("custom.md")).toBe(true);
    expect(result.brokenLinks.includes("custom.md -> ./missing.md")).toBe(true);
    expect(report).toMatch(/status: FAIL/);
  });
});
