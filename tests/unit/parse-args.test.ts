import { describe, expect, it } from "@jest/globals";

import {
  CliArgumentParser,
  CLI_USAGE,
  parseArgs,
  toChunkDurationMs,
} from "../../src/cli/cli-argument-parser.js";
import { CLI_DEFAULT_RAW_INPUT_DIR } from "../../src/cli/input-path-resolver.js";

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

  it("retorna help quando solicitado", () => {
    const parsed = parseArgs(["--help"]);

    expect(parsed.kind).toBe("help");

    if (parsed.kind !== "help") {
      throw new Error("Resultado inesperado");
    }

    expect(parsed.text).toBe(CLI_USAGE);
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
});
