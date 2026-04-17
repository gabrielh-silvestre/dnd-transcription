import { ValidationError } from "../shared/errors.js";
import { type CleanupPolicy } from "../shared/paths.js";

export const CLI_DEFAULT_RAW_INPUT_DIR = ".ignore/raw";

export const CLI_USAGE = `Uso:
  npm run transcribe -- --input <arquivo.mkv> --output <diretorio> --chunk-duration-seconds <segundos> --concurrency <n> --provider <fake|openai-whisper|openai-transcription> --cleanup-policy <on-success|keep> [--resume]

Obs:
  - Se --input receber apenas o nome do arquivo (ex.: sessao.mkv), a CLI busca em ${CLI_DEFAULT_RAW_INPUT_DIR}/sessao.mkv.
`;

export interface CliOptions {
  inputPath: string;
  outputDir: string;
  chunkDurationSeconds: number;
  chunkDurationMs: number;
  concurrency: number;
  provider: string;
  cleanupPolicy: CleanupPolicy;
  resume: boolean;
}

export interface CliHelpResult {
  kind: "help";
  text: string;
}

export interface CliRunResult {
  kind: "run";
  options: CliOptions;
}

export type CliParseResult = CliHelpResult | CliRunResult;

const supportedFlags = new Set([
  "--input",
  "--output",
  "--chunk-duration-seconds",
  "--concurrency",
  "--provider",
  "--cleanup-policy",
  "--resume",
  "--help",
]);

function parseFlagArguments(argv: string[]): Map<string, string | boolean> {
  const parsed = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;

    if (!token.startsWith("--")) {
      throw new ValidationError(`Argumento inesperado: ${token}`);
    }

    const [rawFlag, inlineValue] = token.split("=", 2);

    if (!supportedFlags.has(rawFlag)) {
      throw new ValidationError(`Flag desconhecida: ${rawFlag}`);
    }

    if (rawFlag === "--resume" || rawFlag === "--help") {
      parsed.set(rawFlag, true);
      continue;
    }

    const value = inlineValue ?? argv[index + 1];

    if (value === undefined || value.startsWith("--")) {
      throw new ValidationError(`Flag ${rawFlag} exige um valor.`);
    }

    if (inlineValue === undefined) {
      index += 1;
    }

    parsed.set(rawFlag, value);
  }

  return parsed;
}

function requireString(parsed: Map<string, string | boolean>, flag: string): string {
  const value = parsed.get(flag);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`Flag obrigatoria ausente: ${flag}`);
  }

  return value;
}

function requirePositiveInteger(parsed: Map<string, string | boolean>, flag: string): number {
  const rawValue = requireString(parsed, flag);
  const value = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`Flag ${flag} deve ser um inteiro positivo.`);
  }

  return value;
}

export function toChunkDurationMs(chunkDurationSeconds: number): number {
  return chunkDurationSeconds * 1_000;
}

export function parseArgs(argv: string[]): CliParseResult {
  const parsed = parseFlagArguments(argv);

  if (parsed.get("--help") === true) {
    return {
      kind: "help",
      text: CLI_USAGE,
    };
  }

  const cleanupPolicy = requireString(parsed, "--cleanup-policy");

  if (cleanupPolicy !== "on-success" && cleanupPolicy !== "keep") {
    throw new ValidationError("Flag --cleanup-policy deve ser 'on-success' ou 'keep'.");
  }

  const chunkDurationSeconds = requirePositiveInteger(parsed, "--chunk-duration-seconds");

  return {
    kind: "run",
    options: {
      inputPath: requireString(parsed, "--input"),
      outputDir: requireString(parsed, "--output"),
      chunkDurationSeconds,
      chunkDurationMs: toChunkDurationMs(chunkDurationSeconds),
      concurrency: requirePositiveInteger(parsed, "--concurrency"),
      provider: requireString(parsed, "--provider"),
      cleanupPolicy,
      resume: parsed.get("--resume") === true,
    },
  };
}
