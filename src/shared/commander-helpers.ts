import { CommanderError, InvalidArgumentError } from "commander";

export function createPositiveIntegerParser(flag: string): (value: string) => number {
  return (value) => {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new InvalidArgumentError(`Flag ${flag} deve ser um inteiro positivo.`);
    }

    return parsed;
  };
}

export function createRejectDashDashParser(flag: string): (value: string) => string {
  return (value) => {
    if (value.startsWith("--")) {
      throw new InvalidArgumentError(`Flag ${flag} exige um valor.`);
    }

    return value;
  };
}

export function collectRejectingDashDash(flag: string): (value: string, previous: string[]) => string[] {
  return (value, previous) => {
    if (value.startsWith("--")) {
      throw new InvalidArgumentError(`Flag ${flag} exige um valor.`);
    }

    return previous.concat([value]);
  };
}

export const INTEGER_FLAGS = new Set<string>([
  "--chunk-duration-seconds",
  "--concurrency",
  "--file-concurrency",
  "--limit",
]);

// 1 membro hoje → a mensagem de choices permanece literal de --cleanup-policy.
// Se entrar uma 2ª choices-flag, parametrizar a mensagem por flag (ver follow-up no ADR).
export const CHOICES_FLAGS = new Set<string>(["--cleanup-policy"]);

export const STRING_VALUE_FLAGS = new Set<string>([
  "--input",
  "--output",
  "--provider",
  "--root",
  "--source",
  "--query",
]);

function extractFlag(message: string): string {
  // Acoplamento ao commander@15: a mensagem é `error: option '<flag> <placeholder>' ...`
  // A regex captura o conteúdo entre aspas simples; o `.split(" ")[0]` descarta o placeholder.
  return message.match(/option '([^']+)'/)?.[1]?.split(" ")[0] ?? "";
}

export function translateCommanderError(
  error: CommanderError,
): { kind: "help" | "version" } | { message: string } {
  if (error.code === "commander.help" || error.code === "commander.helpDisplayed") {
    return { kind: "help" };
  }

  if (error.code === "commander.version") {
    return { kind: "version" };
  }

  if (error.code === "commander.unknownOption") {
    return { message: `Flag desconhecida: ${extractFlag(error.message)}` };
  }

  if (
    error.code === "commander.optionMissingArgument" ||
    error.code === "commander.missingArgument"
  ) {
    return { message: `Flag ${extractFlag(error.message)} exige um valor.` };
  }

  if (error.code === "commander.invalidArgument") {
    const flag = extractFlag(error.message);

    if (error.message.includes("Allowed choices") || CHOICES_FLAGS.has(flag)) {
      return { message: "Flag --cleanup-policy deve ser 'on-success' ou 'keep'." };
    }

    if (INTEGER_FLAGS.has(flag)) {
      return { message: `Flag ${flag} deve ser um inteiro positivo.` };
    }

    if (STRING_VALUE_FLAGS.has(flag)) {
      return { message: `Flag ${flag} exige um valor.` };
    }

    return { message: `Flag ${flag} é inválida.` };
  }

  if (error.code === "commander.excessArguments") {
    // Acoplamento ao commander@15: a mensagem é `... got N: <tokens>.`
    // A regex `got \d+: (.+)\.$` captura os tokens excedentes listados pelo commander.
    const token = error.message.match(/got \d+: (.+)\.$/)?.[1] ?? "";

    return { message: `Argumento inesperado: ${token}` };
  }

  return { message: error.message.replace(/^error: /, "") };
}
