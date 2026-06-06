import { Command, CommanderError } from "commander";

import {
  collectRejectingDashDash,
  createPositiveIntegerParser,
  createRejectDashDashParser,
  translateCommanderError,
} from "../../shared/commander-helpers.js";
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

export class WikiArgumentParser {
  public parse(argv: string[]): WikiCliParseResult {
    let helpText = "";
    let errText = "";
    let captured: WikiCliParseResult | null = null;

    const writeOut = (text: string): void => {
      helpText += text;
    };
    // O caso `wiki --` dispara commander.help e o commander escreve o help em
    // writeErr (writeOut fica vazio). Acumular aqui (em vez de no-op) permite usar
    // esse texto como fallback no ramo help; isso NAO vaza para o stderr real.
    const writeErr = (text: string): void => {
      errText += text;
    };

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
        .option(
          "--root <diretorio>",
          "diretorio raiz do wiki",
          createRejectDashDashParser("--root"),
          DEFAULT_CODE_WIKI_ROOT,
        );

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
      .option(
        "--source <caminho>",
        "fonte a ingerir (informe uma vez por fonte)",
        collectRejectingDashDash("--source"),
        [],
      )
      .action((options: RawWikiIngestOptions) => {
        if (options.source.length === 0) {
          throw new ValidationError("Comando ingest exige ao menos um --source.", "wiki");
        }

        captured = { kind: "ingest", wikiRoot: options.root, sourcePaths: options.source };
      });

    registerSubcommand("query", "consulta paginas do wiki")
      .option("--query <termos>", "termos de busca", createRejectDashDashParser("--query"))
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
        if (error.code === "commander.unknownCommand") {
          const cmd = error.message.match(/unknown command '([^']+)'/)?.[1] ?? "<vazio>";

          throw new ValidationError(`Comando wiki desconhecido: ${cmd}`, "wiki");
        }

        const translated = translateCommanderError(error);

        if ("kind" in translated) {
          return { kind: "help", text: helpText || errText };
        }

        throw new ValidationError(translated.message, "wiki");
      }

      throw error;
    }

    // Workaround de control-flow narrowing do TS: `captured` eh atribuido dentro das
    // closures de .action(); apos um parse bem-sucedido toda rota valida passou por uma
    // action, mas o TS estreita `captured` para `null` (nao reatribuido em caminho visivel),
    // entao a assercao via `unknown` eh a forma minima que compila. NAO eh rede defensiva.
    const result = captured as unknown as WikiCliParseResult;

    return result;
  }
}
