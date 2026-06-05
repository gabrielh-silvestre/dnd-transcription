import { Command, CommanderError, InvalidArgumentError } from "commander";

import { ValidationError } from "../../shared/errors.js";
import { DEFAULT_CODE_WIKI_ROOT } from "../shared/wiki-paths.js";

export const WIKI_USAGE = `Uso:
  npm run wiki -- init [--root <diretorio>]
  npm run wiki -- refresh [--root <diretorio>]
  npm run wiki -- ingest --source <caminho> [--source <caminho> ...] [--root <diretorio>]
  npm run wiki -- query --query "<termos>" [--limit <n>] [--root <diretorio>]
  npm run wiki -- lint [--root <diretorio>]

Obs:
  - O wiki documenta o codigo do repositorio em ${DEFAULT_CODE_WIKI_ROOT}/.
  - ${DEFAULT_CODE_WIKI_ROOT}/evidence/ eh gerado deterministicamente pelo CLI.
  - ${DEFAULT_CODE_WIKI_ROOT}/pages/ eh reservado para refinamento por LLM ou humano.
  - Use ingest apos mudancas relevantes em src/, tests/, README.md, AGENTS.md, CLAUDE.md ou .omx/plans/.
`;

export interface WikiInitCommand {
  kind: "init";
  wikiRoot: string;
}

export interface WikiRefreshCommand {
  kind: "refresh";
  wikiRoot: string;
}

export interface WikiIngestCommand {
  kind: "ingest";
  wikiRoot: string;
  sourcePaths: string[];
}

export interface WikiQueryCommand {
  kind: "query";
  wikiRoot: string;
  query: string;
  limit: number;
}

export interface WikiLintCommand {
  kind: "lint";
  wikiRoot: string;
}

export interface WikiHelpResult {
  kind: "help";
  text: string;
}

export type WikiCliParseResult =
  | WikiHelpResult
  | WikiInitCommand
  | WikiRefreshCommand
  | WikiIngestCommand
  | WikiQueryCommand
  | WikiLintCommand;

interface RawWikiRootOptions {
  root: string;
}

interface RawWikiIngestOptions extends RawWikiRootOptions {
  source: string[];
}

interface RawWikiQueryOptions extends RawWikiRootOptions {
  query?: string;
  limit: number;
}

// TODO OPT: collectRepeatable/createPositiveIntegerParser/stripCommanderErrorPrefix are
// intentionally duplicated in src/cli/cli-argument-parser.ts to keep each CLI parser
// self-contained (same isolation the pre-commander parsers had). Consolidate into a
// shared helper module only if a third commander-based CLI appears.
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

export class WikiArgumentParser {
  public parse(argv: string[]): WikiCliParseResult {
    let helpText = "";
    let captured: WikiCliParseResult | null = null;

    const writeOut = (text: string): void => {
      helpText += text;
    };
    const writeErr = (): void => {};

    const program = new Command()
      .name("wiki")
      .exitOverride()
      .configureOutput({ writeOut, writeErr })
      .helpOption("--help", "exibe instrucoes de uso")
      .addHelpText("after", WIKI_USAGE);

    program.helpCommand(false);

    // exitOverride/configureOutput sao aplicados explicitamente em cada subcomando
    // (alem do programa raiz) para garantir que nenhum caminho chame process.exit.
    const registerSubcommand = (name: string, description: string): Command =>
      program
        .command(name)
        .description(description)
        .exitOverride()
        .configureOutput({ writeOut, writeErr })
        .helpOption("--help", "exibe instrucoes de uso")
        .option("--root <diretorio>", "diretorio raiz do wiki", DEFAULT_CODE_WIKI_ROOT);

    registerSubcommand("init", "cria a estrutura inicial do wiki").action(
      (options: RawWikiRootOptions) => {
        captured = { kind: "init", wikiRoot: options.root };
      },
    );

    registerSubcommand("refresh", "regenera a evidencia do wiki").action(
      (options: RawWikiRootOptions) => {
        captured = { kind: "refresh", wikiRoot: options.root };
      },
    );

    registerSubcommand("lint", "valida a saude do wiki").action(
      (options: RawWikiRootOptions) => {
        captured = { kind: "lint", wikiRoot: options.root };
      },
    );

    registerSubcommand("ingest", "ingere fontes de codigo na evidencia do wiki")
      .option("--source <caminho>", "fonte a ingerir (informe uma vez por fonte)", collectRepeatable, [])
      .action((options: RawWikiIngestOptions) => {
        if (options.source.length === 0) {
          throw new ValidationError("Comando ingest exige ao menos um --source.", "wiki");
        }

        captured = { kind: "ingest", wikiRoot: options.root, sourcePaths: options.source };
      });

    registerSubcommand("query", "consulta paginas do wiki")
      .option("--query <termos>", "termos de busca")
      .option("--limit <n>", "limite de resultados", createPositiveIntegerParser("--limit"), 5)
      .action((options: RawWikiQueryOptions) => {
        const query = options.query;

        if (query === undefined || query.trim().length === 0) {
          throw new ValidationError("Comando query exige --query com texto nao vazio.", "wiki");
        }

        captured = { kind: "query", wikiRoot: options.root, query, limit: options.limit };
      });

    try {
      // argv vazio segue o caminho de help (exit 0), como no parser anterior.
      program.parse(argv.length === 0 ? ["--help"] : argv, { from: "user" });
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }

      if (error instanceof CommanderError) {
        if (error.exitCode === 0) {
          return { kind: "help", text: helpText };
        }

        throw new ValidationError(stripCommanderErrorPrefix(error.message), "wiki");
      }

      throw error;
    }

    const result: WikiCliParseResult | null = captured;

    if (result === null) {
      throw new ValidationError(`Comando wiki desconhecido: ${argv[0] ?? "<vazio>"}`, "wiki");
    }

    return result;
  }
}
