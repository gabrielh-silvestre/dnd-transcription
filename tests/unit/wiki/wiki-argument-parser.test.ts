import assert from "node:assert/strict";
import test from "node:test";

import { WikiArgumentParser, WIKI_USAGE } from "../../../src/wiki/cli/wiki-argument-parser.js";

test("WikiArgumentParser retorna help quando argv esta vazio", () => {
  const parser = new WikiArgumentParser();
  const result = parser.parse([]);

  assert.deepEqual(result, {
    kind: "help",
    text: WIKI_USAGE,
  });
});

test("WikiArgumentParser aceita ingest com multiplos sources e root customizado", () => {
  const parser = new WikiArgumentParser();
  const result = parser.parse([
    "ingest",
    "--source",
    "src/cli/main.ts",
    "--source=README.md",
    "--root",
    "knowledge/code-wiki",
  ]);

  assert.deepEqual(result, {
    kind: "ingest",
    wikiRoot: "knowledge/code-wiki",
    sourcePaths: ["src/cli/main.ts", "README.md"],
  });
});

test("WikiArgumentParser valida query e limit", () => {
  const parser = new WikiArgumentParser();
  const result = parser.parse([
    "query",
    "--query",
    "resume semantics",
    "--limit",
    "3",
  ]);

  assert.deepEqual(result, {
    kind: "query",
    wikiRoot: "docs/wiki",
    query: "resume semantics",
    limit: 3,
  });
});

test("WikiArgumentParser falha quando ingest nao recebe source", () => {
  const parser = new WikiArgumentParser();

  assert.throws(() => {
    parser.parse(["ingest"]);
  }, /ao menos um --source/);
});
