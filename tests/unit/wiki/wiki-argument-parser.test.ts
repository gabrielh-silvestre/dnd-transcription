import { describe, expect, it, jest } from "@jest/globals";

import { ValidationError } from "../../../src/shared/errors.js";
import { type Logger } from "../../../src/shared/logger.js";
import { WikiArgumentParser, WIKI_USAGE } from "../../../src/wiki/cli/wiki-argument-parser.js";
import { runWikiCli } from "../../../src/wiki/cli/main.js";

const silentLogger: Logger = {
  info() {},
  warn() {},
  error() {},
};

describe("Wiki argument parser", () => {
  describe("parse", () => {
    it("retorna help quando argv esta vazio", () => {
      const parser = new WikiArgumentParser();
      const result = parser.parse([]);

      expect(result.kind).toBe("help");

      if (result.kind !== "help") {
        throw new Error("Resultado inesperado");
      }

      expect(result.text).toContain(WIKI_USAGE);
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

    it("lanca ValidationError para flag desconhecida em subcomando", () => {
      const parser = new WikiArgumentParser();

      expect(() => {
        parser.parse(["ingest", "--bogus"]);
      }).toThrow(ValidationError);
    });

    it("retorna help para `--` e o texto contem WIKI_USAGE", () => {
      const parser = new WikiArgumentParser();
      const result = parser.parse(["--"]);

      expect(result.kind).toBe("help");

      if (result.kind !== "help") {
        throw new Error("Resultado inesperado");
      }

      expect(result.text).toContain(WIKI_USAGE);
    });

    it("comando desconhecido usa mensagem PT exata", () => {
      const parser = new WikiArgumentParser();

      expect(() => {
        parser.parse(["bogus-cmd"]);
      }).toThrow(new ValidationError("Comando wiki desconhecido: bogus-cmd", "wiki"));
    });

    it("flag desconhecida em subcomando usa mensagem PT exata", () => {
      const parser = new WikiArgumentParser();

      expect(() => {
        parser.parse(["ingest", "--bogus"]);
      }).toThrow(new ValidationError("Flag desconhecida: --bogus", "wiki"));
    });

    it("rejeita `--query --` com mensagem PT exata", () => {
      const parser = new WikiArgumentParser();

      expect(() => {
        parser.parse(["query", "--query", "--"]);
      }).toThrow(new ValidationError("Flag --query exige um valor.", "wiki"));
    });

    it("rejeita `--source --` com mensagem PT exata", () => {
      const parser = new WikiArgumentParser();

      expect(() => {
        parser.parse(["ingest", "--source", "--"]);
      }).toThrow(new ValidationError("Flag --source exige um valor.", "wiki"));
    });

    it("acumula --source repetidos sem lancar", () => {
      const parser = new WikiArgumentParser();
      const result = parser.parse(["ingest", "--source", "src/cli", "--source", "src/wiki"]);

      expect(result).toStrictEqual({
        kind: "ingest",
        wikiRoot: "docs/wiki",
        sourcePaths: ["src/cli", "src/wiki"],
      });
    });

    it("limit invalido usa mensagem PT exata", () => {
      const parser = new WikiArgumentParser();

      expect(() => {
        parser.parse(["query", "--query", "x", "--limit", "0"]);
      }).toThrow(new ValidationError("Flag --limit deve ser um inteiro positivo.", "wiki"));
    });

    it("excesso de argumentos usa mensagem PT exata", () => {
      const parser = new WikiArgumentParser();

      expect(() => {
        parser.parse(["init", "extra"]);
      }).toThrow(new ValidationError("Argumento inesperado: extra", "wiki"));
    });
  });

  describe("runWikiCli", () => {
    it("retorna 1 para erro dentro de subcomando sem chamar process.exit", async () => {
      const exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit nao deve ser chamado");
      });

      try {
        const exitCode = await runWikiCli(["ingest", "--bogus"], {
          createLogger: () => silentLogger,
        });

        expect(exitCode).toBe(1);
        expect(exitSpy).not.toHaveBeenCalled();
      } finally {
        exitSpy.mockRestore();
      }
    });

    it("retorna 0 para `--` (help) sem chamar process.exit", async () => {
      const exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit nao deve ser chamado");
      });

      try {
        const exitCode = await runWikiCli(["--"], {
          createLogger: () => silentLogger,
        });

        expect(exitCode).toBe(0);
        expect(exitSpy).not.toHaveBeenCalled();
      } finally {
        exitSpy.mockRestore();
      }
    });
  });
});
