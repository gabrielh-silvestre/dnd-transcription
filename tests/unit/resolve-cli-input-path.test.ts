import assert from "node:assert/strict";
import test from "node:test";

import { resolveCliInputPath } from "../../src/cli/main.js";
import { CLI_DEFAULT_RAW_INPUT_DIR } from "../../src/cli/parse-args.js";

test("resolveCliInputPath prefixa nome de arquivo simples com diretorio raw padrao", () => {
  assert.equal(resolveCliInputPath("sessao-01.mkv"), `${CLI_DEFAULT_RAW_INPUT_DIR}/sessao-01.mkv`);
});

test("resolveCliInputPath preserva caminhos relativos explicitos", () => {
  assert.equal(resolveCliInputPath("./midia/sessao-01.mkv"), "./midia/sessao-01.mkv");
  assert.equal(resolveCliInputPath(".ignore/raw/sessao-01.mkv"), ".ignore/raw/sessao-01.mkv");
});

test("resolveCliInputPath preserva caminhos absolutos", () => {
  const absolutePath = process.platform === "win32"
    ? "C:\\tmp\\sessao-01.mkv"
    : "/tmp/sessao-01.mkv";

  assert.equal(resolveCliInputPath(absolutePath), absolutePath);
});
