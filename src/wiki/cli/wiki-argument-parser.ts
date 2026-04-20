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

interface ParsedFlags {
  values: Map<string, string[]>;
  booleans: Set<string>;
}

const supportedCommands = new Set(["init", "refresh", "ingest", "query", "lint"]);
const supportedFlags = new Set(["--root", "--source", "--query", "--limit", "--help"]);

export class WikiArgumentParser {
  public parse(argv: string[]): WikiCliParseResult {
    if (argv.length === 0 || argv.includes("--help")) {
      return {
        kind: "help",
        text: WIKI_USAGE,
      };
    }

    const command = argv[0]?.trim();

    if (command === undefined || command.length === 0 || !supportedCommands.has(command)) {
      throw new ValidationError(`Comando wiki desconhecido: ${command ?? "<vazio>"}`, "wiki");
    }

    const flags = this.parseFlags(argv.slice(1));
    const wikiRoot = this.readOptionalValue(flags, "--root") ?? DEFAULT_CODE_WIKI_ROOT;

    if (command === "init") {
      return { kind: "init", wikiRoot };
    }

    if (command === "refresh") {
      return { kind: "refresh", wikiRoot };
    }

    if (command === "lint") {
      return { kind: "lint", wikiRoot };
    }

    if (command === "ingest") {
      const sourcePaths = this.readValues(flags, "--source");

      if (sourcePaths.length === 0) {
        throw new ValidationError("Comando ingest exige ao menos um --source.", "wiki");
      }

      return {
        kind: "ingest",
        wikiRoot,
        sourcePaths,
      };
    }

    const query = this.readOptionalValue(flags, "--query");

    if (query === null || query.trim().length === 0) {
      throw new ValidationError("Comando query exige --query com texto nao vazio.", "wiki");
    }

    return {
      kind: "query",
      wikiRoot,
      query,
      limit: this.readPositiveInteger(flags, "--limit") ?? 5,
    };
  }

  private parseFlags(argv: readonly string[]): ParsedFlags {
    const values = new Map<string, string[]>();
    const booleans = new Set<string>();

    for (let index = 0; index < argv.length; index += 1) {
      const token = argv[index]!;

      if (!token.startsWith("--")) {
        throw new ValidationError(`Argumento inesperado: ${token}`, "wiki");
      }

      const [flag, inlineValue] = token.split("=", 2);

      if (!supportedFlags.has(flag)) {
        throw new ValidationError(`Flag desconhecida: ${flag}`, "wiki");
      }

      if (flag === "--help") {
        booleans.add(flag);
        continue;
      }

      const value = inlineValue ?? argv[index + 1];

      if (value === undefined || value.startsWith("--")) {
        throw new ValidationError(`Flag ${flag} exige um valor.`, "wiki");
      }

      if (inlineValue === undefined) {
        index += 1;
      }

      const currentValues = values.get(flag) ?? [];
      currentValues.push(value);
      values.set(flag, currentValues);
    }

    return { values, booleans };
  }

  private readValues(parsed: ParsedFlags, flag: string): string[] {
    return parsed.values.get(flag) ?? [];
  }

  private readOptionalValue(parsed: ParsedFlags, flag: string): string | null {
    const values = this.readValues(parsed, flag);

    if (values.length === 0) {
      return null;
    }

    return values[values.length - 1] ?? null;
  }

  private readPositiveInteger(parsed: ParsedFlags, flag: string): number | null {
    const rawValue = this.readOptionalValue(parsed, flag);

    if (rawValue === null) {
      return null;
    }

    const value = Number.parseInt(rawValue, 10);

    if (!Number.isInteger(value) || value <= 0) {
      throw new ValidationError(`Flag ${flag} deve ser um inteiro positivo.`, "wiki");
    }

    return value;
  }
}
