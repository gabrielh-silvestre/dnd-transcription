import { describe, expect, it } from "@jest/globals";

import { InputPathResolver, resolveCliInputPath, CLI_DEFAULT_RAW_INPUT_DIR } from "../../src/cli/input-path-resolver.js";

describe("Input path resolver", () => {
  describe("resolveCliInputPath", () => {
    it("prefixa nome de arquivo simples com diretorio raw padrao", () => {
      expect(resolveCliInputPath("sessao-01.mkv")).toBe(`${CLI_DEFAULT_RAW_INPUT_DIR}/sessao-01.mkv`);
    });

    it("preserva caminhos relativos explicitos", () => {
      expect(resolveCliInputPath("./midia/sessao-01.mkv")).toBe("./midia/sessao-01.mkv");
      expect(resolveCliInputPath(".ignore/raw/sessao-01.mkv")).toBe(".ignore/raw/sessao-01.mkv");
    });

    it("preserva caminhos absolutos", () => {
      const absolutePath = process.platform === "win32"
        ? "C:\\tmp\\sessao-01.mkv"
        : "/tmp/sessao-01.mkv";

      expect(resolveCliInputPath(absolutePath)).toBe(absolutePath);
    });
  });

  it("permite customizar o diretorio raw padrao", () => {
    const resolver = new InputPathResolver("fixtures/raw");

    expect(resolver.resolve("sessao-02.mkv")).toBe("fixtures/raw/sessao-02.mkv");
  });
});
