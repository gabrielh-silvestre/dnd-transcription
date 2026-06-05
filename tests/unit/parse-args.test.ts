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
