import { describe, expect, it } from "@jest/globals";

import { WikiArgumentParser, WIKI_USAGE } from "../../../src/wiki/cli/wiki-argument-parser.js";

describe("Wiki argument parser", () => {
  describe("parse", () => {
    it("retorna help quando argv esta vazio", () => {
      const parser = new WikiArgumentParser();
      const result = parser.parse([]);

      expect(result).toStrictEqual({
        kind: "help",
        text: WIKI_USAGE,
      });
    });

    it("aceita ingest com multiplos sources e root customizado", () => {
      const parser = new WikiArgumentParser();
      const result = parser.parse([
        "ingest",
        "--source",
        "src/cli/main.ts",
        "--source=README.md",
        "--root",
        "knowledge/code-wiki",
      ]);

      expect(result).toStrictEqual({
        kind: "ingest",
        wikiRoot: "knowledge/code-wiki",
        sourcePaths: ["src/cli/main.ts", "README.md"],
      });
    });

    it("valida query e limit", () => {
      const parser = new WikiArgumentParser();
      const result = parser.parse([
        "query",
        "--query",
        "resume semantics",
        "--limit",
        "3",
      ]);

      expect(result).toStrictEqual({
        kind: "query",
        wikiRoot: "docs/wiki",
        query: "resume semantics",
        limit: 3,
      });
    });

    it("falha quando ingest nao recebe source", () => {
      const parser = new WikiArgumentParser();

      expect(() => {
        parser.parse(["ingest"]);
      }).toThrow(/ao menos um --source/);
    });
  });
});
