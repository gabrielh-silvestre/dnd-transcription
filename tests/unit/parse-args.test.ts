import { describe, expect, it, jest } from "@jest/globals";

import { ValidationError } from "../../src/shared/errors.js";
import {
  CliArgumentParser,
  CLI_USAGE,
  type CliRunResult,
  parseArgs,
  toChunkDurationMs,
} from "../../src/cli/cli-argument-parser.js";
import { CLI_DEFAULT_RAW_INPUT_DIR } from "../../src/cli/input-path-resolver.js";
import { runCli } from "../../src/cli/main.js";
import { type Logger } from "../../src/shared/logger.js";

const silentLogger: Logger = {
  info() {},
  warn() {},
  error() {},
};

function parseRun(argv: string[]): CliRunResult {
  const parsed = new CliArgumentParser().parse(argv);

  if (parsed.kind !== "run") {
    throw new Error("Resultado inesperado");
  }

  return parsed;
}

describe("CLI argument parser", () => {
  it("converte segundos para ms e preserva --resume", () => {
    const parsed = new CliArgumentParser().parse([
      "--input",
      "./input.mkv",
      "--output",
      "./tmp/job",
      "--chunk-duration-seconds",
      "600",
      "--concurrency",
      "3",
      "--provider",
      "fake",
      "--cleanup-policy",
      "on-success",
      "--resume",
    ]);

    expect(parsed.kind).toBe("run");

    if (parsed.kind !== "run") {
      throw new Error("Resultado inesperado");
    }

    expect(parsed.options.chunkDurationMs).toBe(600_000);
    expect(parsed.options.resume).toBe(true);
    expect(toChunkDurationMs(60)).toBe(60_000);
  });

  it("coleta um unico --input em inputPaths sem resolver o caminho", () => {
    const parsed = parseRun([
      "--input",
      "./input.mkv",
      "--output",
      "./tmp/job",
      "--chunk-duration-seconds",
      "600",
      "--concurrency",
      "3",
      "--provider",
      "fake",
      "--cleanup-policy",
      "keep",
    ]);

    expect(parsed.options.inputPaths).toStrictEqual(["./input.mkv"]);
  });

  it("acumula --input repetidos preservando a ordem", () => {
    const parsed = parseRun([
      "--input",
      "a",
      "--input",
      "b",
      "--input",
      "c",
      "--output",
      "./tmp/job",
      "--chunk-duration-seconds",
      "600",
      "--concurrency",
      "3",
      "--provider",
      "fake",
      "--cleanup-policy",
      "keep",
    ]);

    expect(parsed.options.inputPaths).toStrictEqual(["a", "b", "c"]);
  });

  it("rejeita quando --input esta ausente", () => {
    expect(() => {
      parseArgs([
        "--output",
        "./tmp/job",
        "--chunk-duration-seconds",
        "600",
        "--concurrency",
        "3",
        "--provider",
        "fake",
        "--cleanup-policy",
        "keep",
      ]);
    }).toThrow(ValidationError);
  });

  it("usa file-concurrency padrao 1 quando ausente", () => {
    const parsed = parseRun([
      "--input",
      "./input.mkv",
      "--output",
      "./tmp/job",
      "--chunk-duration-seconds",
      "600",
      "--concurrency",
      "3",
      "--provider",
      "fake",
      "--cleanup-policy",
      "keep",
    ]);

    expect(parsed.options.fileConcurrency).toBe(1);
  });

  it("le file-concurrency explicito", () => {
    const parsed = parseRun([
      "--input",
      "./input.mkv",
      "--output",
      "./tmp/job",
      "--chunk-duration-seconds",
      "600",
      "--concurrency",
      "3",
      "--file-concurrency",
      "4",
      "--provider",
      "fake",
      "--cleanup-policy",
      "keep",
    ]);

    expect(parsed.options.fileConcurrency).toBe(4);
  });

  it("rejeita file-concurrency nao positivo", () => {
    expect(() => {
      parseArgs([
        "--input",
        "./input.mkv",
        "--output",
        "./tmp/job",
        "--chunk-duration-seconds",
        "600",
        "--concurrency",
        "3",
        "--file-concurrency",
        "0",
        "--provider",
        "fake",
        "--cleanup-policy",
        "keep",
      ]);
    }).toThrow(/file-concurrency/);
  });

  it("retorna help quando solicitado", () => {
    const parsed = parseArgs(["--help"]);

    expect(parsed.kind).toBe("help");

    if (parsed.kind !== "help") {
      throw new Error("Resultado inesperado");
    }

    expect(parsed.text).toContain(CLI_USAGE);
    expect(parsed.text).toMatch(/openai-transcription/);
    expect(parsed.text).toMatch(new RegExp(CLI_DEFAULT_RAW_INPUT_DIR.replace(".", "\\.")));
  });

  it("rejeita cleanup policy invalido", () => {
    expect(() => {
      parseArgs([
        "--input",
        "./input.mkv",
        "--output",
        "./tmp/job",
        "--chunk-duration-seconds",
        "600",
        "--concurrency",
        "3",
        "--provider",
        "fake",
        "--cleanup-policy",
        "delete-all",
      ]);
    }).toThrow(/cleanup-policy/);
  });

  it("lanca ValidationError para flag desconhecida", () => {
    expect(() => {
      parseArgs(["--bogus"]);
    }).toThrow(ValidationError);
  });

  it("nao vaza help/erro para `--` (nao lanca (outputHelp))", () => {
    let thrown: unknown;

    try {
      parseArgs(["--"]);
    } catch (error) {
      thrown = error;
    }

    if (thrown instanceof ValidationError) {
      expect(thrown.message).not.toBe("(outputHelp)");
    }
  });

  it("flag desconhecida usa mensagem PT exata", () => {
    expect(() => {
      parseArgs(["--bogus"]);
    }).toThrow(new ValidationError("Flag desconhecida: --bogus"));
  });

  it("cleanup-policy invalido usa mensagem PT exata", () => {
    expect(() => {
      parseArgs([
        "--input",
        "./input.mkv",
        "--output",
        "./tmp/job",
        "--chunk-duration-seconds",
        "600",
        "--concurrency",
        "3",
        "--provider",
        "fake",
        "--cleanup-policy",
        "delete-all",
      ]);
    }).toThrow(new ValidationError("Flag --cleanup-policy deve ser 'on-success' ou 'keep'."));
  });

  it("file-concurrency invalido usa mensagem PT exata sem texto EN", () => {
    let thrown: unknown;

    try {
      parseArgs([
        "--input",
        "./input.mkv",
        "--output",
        "./tmp/job",
        "--chunk-duration-seconds",
        "600",
        "--concurrency",
        "3",
        "--file-concurrency",
        "0",
        "--provider",
        "fake",
        "--cleanup-policy",
        "keep",
      ]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ValidationError);
    expect((thrown as ValidationError).message).toBe(
      "Flag --file-concurrency deve ser um inteiro positivo.",
    );
    expect((thrown as ValidationError).message).not.toContain("is invalid");
  });

  it("rejeita `--output --` com mensagem PT exata", () => {
    expect(() => {
      parseArgs([
        "--input",
        "./input.mkv",
        "--output",
        "--",
        "--chunk-duration-seconds",
        "600",
        "--concurrency",
        "3",
        "--provider",
        "fake",
        "--cleanup-policy",
        "keep",
      ]);
    }).toThrow(new ValidationError("Flag --output exige um valor."));
  });

  it("rejeita `--input --` com mensagem PT exata", () => {
    expect(() => {
      parseArgs([
        "--input",
        "--",
        "--output",
        "./tmp/job",
        "--chunk-duration-seconds",
        "600",
        "--concurrency",
        "3",
        "--provider",
        "fake",
        "--cleanup-policy",
        "keep",
      ]);
    }).toThrow(new ValidationError("Flag --input exige um valor."));
  });

  it("valor string normal passa apos a introducao dos parsers anti-`--`", () => {
    const parsed = parseRun([
      "--input",
      "./input.mkv",
      "--output",
      "./tmp/job",
      "--chunk-duration-seconds",
      "600",
      "--concurrency",
      "3",
      "--provider",
      "fake",
      "--cleanup-policy",
      "keep",
    ]);

    expect(parsed.options.outputDir).toBe("./tmp/job");
    expect(parsed.options.provider).toBe("fake");
    expect(parsed.options.inputPaths).toStrictEqual(["./input.mkv"]);
  });

  it("valor de --input valido apos valido continua acumulando", () => {
    const parsed = parseRun([
      "--input",
      "a",
      "--input",
      "b",
      "--output",
      "./tmp/job",
      "--chunk-duration-seconds",
      "600",
      "--concurrency",
      "3",
      "--provider",
      "fake",
      "--cleanup-policy",
      "keep",
    ]);

    expect(parsed.options.inputPaths).toStrictEqual(["a", "b"]);
  });

  it("precedencia C3-05: cleanup-policy invalido sem --input reporta cleanup-policy, nao --input", () => {
    let thrown: unknown;

    try {
      parseArgs(["--cleanup-policy", "delete-all"]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ValidationError);
    expect((thrown as ValidationError).message).toBe(
      "Flag --cleanup-policy deve ser 'on-success' ou 'keep'.",
    );
    expect((thrown as ValidationError).message).not.toContain("--input");
  });

  it("runCli retorna 1 para erro de uso sem chamar process.exit", async () => {
    const exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit nao deve ser chamado");
    });

    try {
      const exitCode = await runCli(["--bogus"], { createLogger: () => silentLogger });

      expect(exitCode).toBe(1);
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      exitSpy.mockRestore();
    }
  });
});
