import { ValidationError } from "../shared/errors.js";
import { type CleanupPolicy } from "../shared/paths.js";
import { CLI_DEFAULT_RAW_INPUT_DIR } from "./input-path-resolver.js";

export const CLI_USAGE = `Uso:
  npm run transcribe -- --input <arquivo.mkv> [--input <outro.mkv> ...] --output <diretorio> --chunk-duration-seconds <segundos> --concurrency <n> [--file-concurrency <n>] --provider <fake|openai-whisper|openai-transcription> --cleanup-policy <on-success|keep> [--resume]

Obs:
  - Se --input receber apenas o nome do arquivo (ex.: sessao.mkv), a CLI busca em ${CLI_DEFAULT_RAW_INPUT_DIR}/sessao.mkv.
  - Informe --input uma vez por arquivo para transcrever varios arquivos no mesmo comando.
  - --file-concurrency <n> controla quantos arquivos sao processados em paralelo (padrao 1).
  - Layout de saida: com 1 arquivo a CLI grava <output>/transcript.md (flat); com 2 ou mais arquivos cada arquivo recebe um subdiretorio <output>/<slug>-<hash>/ e a CLI grava um indice em <output>/batch-index.json.
  - As chamadas simultaneas ao provider equivalem aproximadamente a file-concurrency x concurrency.
`;

export interface CliOptions {
  inputPaths: string[];
  outputDir: string;
  chunkDurationSeconds: number;
  chunkDurationMs: number;
  concurrency: number;
  fileConcurrency: number;
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
  "--file-concurrency",
  "--provider",
  "--cleanup-policy",
  "--resume",
  "--help",
]);

interface ParsedFlagArguments {
  flags: Map<string, string | boolean>;
  inputPaths: string[];
}

export function toChunkDurationMs(chunkDurationSeconds: number): number {
  return chunkDurationSeconds * 1_000;
}

export class CliArgumentParser {
  parse(argv: string[]): CliParseResult {
    const { flags, inputPaths } = this.parseFlagArguments(argv);

    if (flags.get("--help") === true) {
      return {
        kind: "help",
        text: CLI_USAGE,
      };
    }

    if (inputPaths.length === 0) {
      throw new ValidationError("Flag obrigatoria ausente: --input");
    }

    const cleanupPolicy = this.requireString(flags, "--cleanup-policy");

    if (cleanupPolicy !== "on-success" && cleanupPolicy !== "keep") {
      throw new ValidationError("Flag --cleanup-policy deve ser 'on-success' ou 'keep'.");
    }

    const chunkDurationSeconds = this.requirePositiveInteger(flags, "--chunk-duration-seconds");

    return {
      kind: "run",
      options: {
        inputPaths,
        outputDir: this.requireString(flags, "--output"),
        chunkDurationSeconds,
        chunkDurationMs: toChunkDurationMs(chunkDurationSeconds),
        concurrency: this.requirePositiveInteger(flags, "--concurrency"),
        fileConcurrency: this.optionalPositiveInteger(flags, "--file-concurrency", 1),
        provider: this.requireString(flags, "--provider"),
        cleanupPolicy,
        resume: flags.get("--resume") === true,
      },
    };
  }

  private parseFlagArguments(argv: string[]): ParsedFlagArguments {
    const flags = new Map<string, string | boolean>();
    const inputPaths: string[] = [];

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
        flags.set(rawFlag, true);
        continue;
      }

      const value = inlineValue ?? argv[index + 1];

      if (value === undefined || value.startsWith("--")) {
        throw new ValidationError(`Flag ${rawFlag} exige um valor.`);
      }

      if (inlineValue === undefined) {
        index += 1;
      }

      if (rawFlag === "--input") {
        inputPaths.push(value);
        continue;
      }

      flags.set(rawFlag, value);
    }

    return { flags, inputPaths };
  }

  private requireString(parsed: Map<string, string | boolean>, flag: string): string {
    const value = parsed.get(flag);

    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ValidationError(`Flag obrigatoria ausente: ${flag}`);
    }

    return value;
  }

  private requirePositiveInteger(parsed: Map<string, string | boolean>, flag: string): number {
    const rawValue = this.requireString(parsed, flag);
    const value = Number.parseInt(rawValue, 10);

    if (!Number.isInteger(value) || value <= 0) {
      throw new ValidationError(`Flag ${flag} deve ser um inteiro positivo.`);
    }

    return value;
  }

  private optionalPositiveInteger(
    parsed: Map<string, string | boolean>,
    flag: string,
    fallback: number,
  ): number {
    if (!parsed.has(flag)) {
      return fallback;
    }

    return this.requirePositiveInteger(parsed, flag);
  }
}

const defaultCliArgumentParser = new CliArgumentParser();

export function parseArgs(argv: string[]): CliParseResult {
  return defaultCliArgumentParser.parse(argv);
}
