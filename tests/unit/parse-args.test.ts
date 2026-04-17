import assert from "node:assert/strict";
import test from "node:test";

import { CLI_DEFAULT_RAW_INPUT_DIR, parseArgs, toChunkDurationMs } from "../../src/cli/parse-args.js";

test("parseArgs converte segundos para ms e preserva --resume", () => {
  const parsed = parseArgs([
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

  assert.equal(parsed.kind, "run");

  if (parsed.kind !== "run") {
    throw new Error("Resultado inesperado");
  }

  assert.equal(parsed.options.chunkDurationMs, 600_000);
  assert.equal(parsed.options.resume, true);
  assert.equal(toChunkDurationMs(60), 60_000);
});

test("parseArgs retorna help quando solicitado", () => {
  const parsed = parseArgs(["--help"]);

  assert.equal(parsed.kind, "help");

  if (parsed.kind !== "help") {
    throw new Error("Resultado inesperado");
  }

  assert.match(parsed.text, /openai-transcription/);
  assert.match(parsed.text, new RegExp(CLI_DEFAULT_RAW_INPUT_DIR.replace(".", "\\.")));
});

test("parseArgs rejeita cleanup policy invalido", () => {
  assert.throws(() => {
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
  }, /cleanup-policy/);
});
