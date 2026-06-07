import { CommanderError } from "commander";
import { describe, expect, it } from "@jest/globals";

import {
  INTEGER_FLAGS,
  STRING_VALUE_FLAGS,
  translateCommanderError,
} from "../../src/shared/commander-helpers.js";

function commanderError(exitCode: number, code: string, message: string): CommanderError {
  return new CommanderError(exitCode, code, message);
}

describe("translateCommanderError", () => {
  it("trata commander.help como help", () => {
    const result = translateCommanderError(
      commanderError(0, "commander.help", "(outputHelp)"),
    );

    expect(result).toStrictEqual({ kind: "help" });
  });

  it("trata commander.helpDisplayed como help", () => {
    const result = translateCommanderError(
      commanderError(0, "commander.helpDisplayed", "(outputHelp)"),
    );

    expect(result).toStrictEqual({ kind: "help" });
  });

  it("trata commander.version como version", () => {
    const result = translateCommanderError(
      commanderError(0, "commander.version", "0.1.0"),
    );

    expect(result).toStrictEqual({ kind: "version" });
  });

  it("traduz commander.unknownOption para PT", () => {
    const result = translateCommanderError(
      commanderError(1, "commander.unknownOption", "error: unknown option '--bogus'"),
    );

    expect(result).toStrictEqual({ message: "Flag desconhecida: --bogus" });
  });

  it("traduz commander.optionMissingArgument para PT", () => {
    const result = translateCommanderError(
      commanderError(
        1,
        "commander.optionMissingArgument",
        "error: option '--output <diretorio>' argument missing",
      ),
    );

    expect(result).toStrictEqual({ message: "Flag --output exige um valor." });
  });

  it("traduz commander.missingArgument para PT (seguranca)", () => {
    const result = translateCommanderError(
      commanderError(
        1,
        "commander.missingArgument",
        "error: option '--output <diretorio>' argument missing",
      ),
    );

    expect(result).toStrictEqual({ message: "Flag --output exige um valor." });
  });

  it("traduz commander.invalidArgument de choices para a mensagem de cleanup-policy", () => {
    const result = translateCommanderError(
      commanderError(
        1,
        "commander.invalidArgument",
        "error: option '--cleanup-policy <politica>' argument 'delete-all' is invalid. Allowed choices are on-success, keep.",
      ),
    );

    expect(result).toStrictEqual({
      message: "Flag --cleanup-policy deve ser 'on-success' ou 'keep'.",
    });
  });

  it("traduz commander.invalidArgument de flag inteira via INTEGER_FLAGS", () => {
    const result = translateCommanderError(
      commanderError(
        1,
        "commander.invalidArgument",
        "error: option '--file-concurrency <n>' argument '0' is invalid. Flag --file-concurrency deve ser um inteiro positivo.",
      ),
    );

    expect(result).toStrictEqual({
      message: "Flag --file-concurrency deve ser um inteiro positivo.",
    });
  });

  it("traduz commander.invalidArgument de flag string anti-`--` via STRING_VALUE_FLAGS", () => {
    const result = translateCommanderError(
      commanderError(
        1,
        "commander.invalidArgument",
        "error: option '--output <diretorio>' argument '--' is invalid. Flag --output exige um valor.",
      ),
    );

    expect(result).toStrictEqual({ message: "Flag --output exige um valor." });
  });

  it("traduz commander.excessArguments para PT com o token excedente", () => {
    const result = translateCommanderError(
      commanderError(
        1,
        "commander.excessArguments",
        "error: too many arguments for 'init'. Expected 0 arguments but got 1: extra.",
      ),
    );

    expect(result).toStrictEqual({ message: "Argumento inesperado: extra" });
  });

  it("normaliza o token de flag removendo o placeholder (R2): invalidArgument inteiro sem `<`", () => {
    const result = translateCommanderError(
      commanderError(
        1,
        "commander.invalidArgument",
        "error: option '--file-concurrency <n>' argument '0' is invalid. Flag --file-concurrency deve ser um inteiro positivo.",
      ),
    );

    if (!("message" in result)) {
      throw new Error("Resultado inesperado");
    }

    expect(result.message).toBe("Flag --file-concurrency deve ser um inteiro positivo.");
    expect(result.message).not.toContain("<");
  });

  it("normaliza o token de flag removendo o placeholder (R2): optionMissingArgument sem `<`", () => {
    const result = translateCommanderError(
      commanderError(
        1,
        "commander.optionMissingArgument",
        "error: option '--output <diretorio>' argument missing",
      ),
    );

    if (!("message" in result)) {
      throw new Error("Resultado inesperado");
    }

    expect(result.message).toBe("Flag --output exige um valor.");
    expect(result.message).not.toContain("<");
  });

  it("reconstroi a PT por categoria, nao pelo sufixo EN (prova R1)", () => {
    const result = translateCommanderError(
      commanderError(
        1,
        "commander.invalidArgument",
        "error: option '--file-concurrency <n>' argument '0' is invalid. SUFIXO TOTALMENTE DIFERENTE.",
      ),
    );

    expect(result).toStrictEqual({
      message: "Flag --file-concurrency deve ser um inteiro positivo.",
    });
  });

  it("usa o fallback de categoria desconhecida para uma flag fora das tabelas", () => {
    const result = translateCommanderError(
      commanderError(
        1,
        "commander.invalidArgument",
        "error: option '--mystery <x>' argument 'z' is invalid. whatever.",
      ),
    );

    expect(result).toStrictEqual({ message: "Flag --mystery é inválida." });
  });

  it("usa o fallback removendo o prefixo `error: ` para um code nao mapeado", () => {
    const result = translateCommanderError(
      commanderError(1, "commander.someFutureCode", "error: algo inesperado aconteceu"),
    );

    expect(result).toStrictEqual({ message: "algo inesperado aconteceu" });
  });

  it("nenhuma traducao vaza texto EN do commander nem o caractere `<`", () => {
    const messages = [
      "error: unknown option '--bogus'",
      "error: option '--output <diretorio>' argument missing",
      "error: option '--cleanup-policy <politica>' argument 'delete-all' is invalid. Allowed choices are on-success, keep.",
      "error: option '--file-concurrency <n>' argument '0' is invalid. Flag --file-concurrency deve ser um inteiro positivo.",
      "error: option '--output <diretorio>' argument '--' is invalid. Flag --output exige um valor.",
      "error: too many arguments for 'init'. Expected 0 arguments but got 1: extra.",
    ];
    const codes = [
      "commander.unknownOption",
      "commander.optionMissingArgument",
      "commander.invalidArgument",
      "commander.invalidArgument",
      "commander.invalidArgument",
      "commander.excessArguments",
    ];

    for (let index = 0; index < messages.length; index += 1) {
      const result = translateCommanderError(commanderError(1, codes[index]!, messages[index]!));

      if (!("message" in result)) {
        throw new Error("Resultado inesperado");
      }

      expect(result.message).not.toContain("unknown option");
      expect(result.message).not.toContain("is invalid");
      expect(result.message).not.toContain("Allowed choices");
      expect(result.message).not.toContain("too many arguments");
      expect(result.message).not.toContain("<");
    }
  });

  describe("teste-guardiao das tabelas de categoria", () => {
    for (const flag of INTEGER_FLAGS) {
      it(`flag inteira ${flag} cai na categoria de inteiro, nao no fallback`, () => {
        const result = translateCommanderError(
          commanderError(
            1,
            "commander.invalidArgument",
            `error: option '${flag} <n>' argument '0' is invalid. qualquer sufixo.`,
          ),
        );

        expect(result).toStrictEqual({
          message: `Flag ${flag} deve ser um inteiro positivo.`,
        });
      });
    }

    for (const flag of STRING_VALUE_FLAGS) {
      it(`flag string ${flag} cai na categoria de valor, nao no fallback`, () => {
        const result = translateCommanderError(
          commanderError(
            1,
            "commander.invalidArgument",
            `error: option '${flag} <x>' argument '--' is invalid. qualquer sufixo.`,
          ),
        );

        expect(result).toStrictEqual({ message: `Flag ${flag} exige um valor.` });
      });
    }
  });
});
