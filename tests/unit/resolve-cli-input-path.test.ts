import assert from "node:assert/strict";
import test from "node:test";

import { InputPathResolver, resolveCliInputPath, CLI_DEFAULT_RAW_INPUT_DIR } from "../../src/cli/input-path-resolver.js";

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

test("InputPathResolver permite customizar o diretorio raw padrao", () => {
  const resolver = new InputPathResolver("fixtures/raw");

  assert.equal(resolver.resolve("sessao-02.mkv"), "fixtures/raw/sessao-02.mkv");
});
