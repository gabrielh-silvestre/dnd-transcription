import { Command, CommanderError, InvalidArgumentError, Option } from "commander";

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

interface RawCliOptions {
  input: string[];
  output?: string;
  chunkDurationSeconds?: number;
  concurrency?: number;
  fileConcurrency: number;
  provider?: string;
  cleanupPolicy?: CleanupPolicy;
  resume: boolean;
}

export function toChunkDurationMs(chunkDurationSeconds: number): number {
  return chunkDurationSeconds * 1_000;
}

function collectRepeatable(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

function createPositiveIntegerParser(flag: string): (value: string) => number {
  return (value) => {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new InvalidArgumentError(`Flag ${flag} deve ser um inteiro positivo.`);
    }

    return parsed;
  };
}

function stripCommanderErrorPrefix(message: string): string {
  return message.replace(/^error: /, "");
}

export class CliArgumentParser {
  parse(argv: string[]): CliParseResult {
    let helpText = "";

    const program = new Command()
      .name("transcribe")
      .exitOverride()
      .configureOutput({
        writeOut: (text) => {
          helpText += text;
        },
        writeErr: () => {},
      })
      .helpOption("--help", "exibe instrucoes de uso")
      .addHelpText("after", CLI_USAGE);

    program
      .option("--input <arquivo>", "arquivo de entrada (informe uma vez por arquivo)", collectRepeatable, [])
      .option("--output <diretorio>", "diretorio de saida do job")
      .option(
        "--chunk-duration-seconds <segundos>",
        "duracao de cada chunk em segundos",
        createPositiveIntegerParser("--chunk-duration-seconds"),
      )
      .option(
        "--concurrency <n>",
        "transcricoes simultaneas por arquivo",
        createPositiveIntegerParser("--concurrency"),
      )
      .option(
        "--file-concurrency <n>",
        "arquivos processados em paralelo",
        createPositiveIntegerParser("--file-concurrency"),
        1,
      )
      .option("--provider <provider>", "provider de transcricao")
      .addOption(
        new Option("--cleanup-policy <politica>", "politica de limpeza dos chunks").choices([
          "on-success",
          "keep",
        ]),
      )
      .option("--resume", "retoma um job existente a partir do estado persistido", false);

    try {
      program.parse(argv, { from: "user" });
    } catch (error) {
      if (error instanceof CommanderError) {
        if (error.exitCode === 0) {
          return { kind: "help", text: helpText };
        }

        throw new ValidationError(stripCommanderErrorPrefix(error.message));
      }

      throw error;
    }

    return { kind: "run", options: this.toCliOptions(program.opts<RawCliOptions>()) };
  }

  private toCliOptions(raw: RawCliOptions): CliOptions {
    if (raw.input.length === 0) {
      throw new ValidationError("Flag obrigatoria ausente: --input");
    }

    const cleanupPolicy = raw.cleanupPolicy;

    if (cleanupPolicy === undefined) {
      throw new ValidationError("Flag obrigatoria ausente: --cleanup-policy");
    }

    const chunkDurationSeconds = this.requirePresent(raw.chunkDurationSeconds, "--chunk-duration-seconds");

    return {
      inputPaths: raw.input,
      outputDir: this.requireNonEmptyString(raw.output, "--output"),
      chunkDurationSeconds,
      chunkDurationMs: toChunkDurationMs(chunkDurationSeconds),
      concurrency: this.requirePresent(raw.concurrency, "--concurrency"),
      fileConcurrency: raw.fileConcurrency,
      provider: this.requireNonEmptyString(raw.provider, "--provider"),
      cleanupPolicy,
      resume: raw.resume,
    };
  }

  private requireNonEmptyString(value: string | undefined, flag: string): string {
    if (value === undefined || value.trim().length === 0) {
      throw new ValidationError(`Flag obrigatoria ausente: ${flag}`);
    }

    return value;
  }

  private requirePresent(value: number | undefined, flag: string): number {
    if (value === undefined) {
      throw new ValidationError(`Flag obrigatoria ausente: ${flag}`);
    }

    return value;
  }
}

const defaultCliArgumentParser = new CliArgumentParser();

export function parseArgs(argv: string[]): CliParseResult {
  return defaultCliArgumentParser.parse(argv);
}
